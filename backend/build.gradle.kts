plugins {
  kotlin("jvm") version "2.1.21"
  kotlin("plugin.spring") version "2.3.21"
  id("org.springframework.boot") version "3.5.14"
  id("io.spring.dependency-management") version "1.1.7"
  kotlin("plugin.jpa") version "2.1.21"
  id("com.diffplug.spotless") version "6.25.0"
  // Detekt — Kotlin static analysis (complexité cyclomatique, magic numbers, méthodes longues,
  // potentiels bugs). Complémentaire de Spotless qui ne fait que la mise en forme. Voir bloc
  // `detekt { … }` plus bas pour la stratégie de ramp-up.
  id("io.gitlab.arturbosch.detekt") version "1.23.8"
}

group = "com.portfolioai"

version = "0.0.1-SNAPSHOT"

java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }

repositories { mavenCentral() }

dependencies {
  implementation("org.springframework.boot:spring-boot-starter-actuator")
  implementation("org.springframework.boot:spring-boot-starter-cache")
  implementation("org.springframework.boot:spring-boot-starter-data-jpa")
  implementation("org.springframework.boot:spring-boot-starter-web")
  implementation("com.github.ben-manes.caffeine:caffeine")
  implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
  // springdoc-openapi — auto-generates an OpenAPI 3.0 schema from Spring controllers + Jackson DTOs
  // and serves Swagger UI at /swagger-ui.html. Activated only in the `local` profile (see
  // application-local.yml) ; the root application.yml keeps both `springdoc.api-docs.enabled` and
  // `springdoc.swagger-ui.enabled` to false so no env reachable from the outside ever exposes the
  // schema. Surfaced in Tilt as a link on the `backend` resource for one-click access during dev.
  implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.7.0")
  implementation("org.flywaydb:flyway-core")
  implementation("org.flywaydb:flyway-database-postgresql")
  implementation("org.jetbrains.kotlin:kotlin-reflect")
  implementation("org.apache.commons:commons-csv:1.14.1")
  runtimeOnly("org.postgresql:postgresql")
  developmentOnly("org.springframework.boot:spring-boot-devtools")
  testImplementation("org.springframework.boot:spring-boot-starter-test")
  testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
  // Kotlin-friendly matchers for Mockito (any(), eq(), times() that respect Kotlin's non-null
  // types — the Java equivalents return `null` for non-nullable parameters and crash).
  testImplementation("org.mockito.kotlin:mockito-kotlin:5.4.0")
  // Local HTTP server for testing outbound clients without hitting the real internet — used by
  // TwelveDataClientTest and FinnhubClientTest to assert rate-limit / 404 / auth-failure
  // behaviour deterministically.
  testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin { compilerOptions { freeCompilerArgs.addAll("-Xjsr305=strict") } }

allOpen {
  annotation("jakarta.persistence.Entity")
  annotation("jakarta.persistence.MappedSuperclass")
  annotation("jakarta.persistence.Embeddable")
}

// Read `.env` from the repo root (gitignored) and inject every key into the test task's
// environment so that `@SpringBootTest` integration tests pick up the same custom ports as
// `tilt up` — without forcing the dev to remember `POSTGRES_HOST_PORT=5444 ./gradlew test`.
// Mirrors the Starlark `load_env_file()` helper in `Tiltfile` ; duplicate parser intentional :
// Gradle has no native .env support and pulling a third-party plugin would be heavyweight for a
// dead-simple format (`KEY=value`, optional surrounding quotes, `#` comments, no escapes).
// When `.env` is absent (CI, fresh clone), the map is empty and the test task falls back to the
// defaults baked into `application.yml` — same behaviour as before this hook existed.
val dotenv: Map<String, String> =
  file("../.env").let { f ->
    if (!f.exists()) emptyMap()
    else
      f.readLines()
        .map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith("#") && "=" in it }
        .associate { line ->
          val (k, v) = line.split("=", limit = 2)
          k.trim() to v.trim().trim('"').trim('\'')
        }
  }

tasks.withType<Test> {
  useJUnitPlatform()
  dotenv.forEach { (k, v) -> environment(k, v) }
}

spotless {
  kotlin {
    ktfmt("0.62").googleStyle()
    target("src/**/*.kt")
    // Forbid new wildcard imports outside the allowlist below. Implemented as a custom check
    // (read-only — throws on detection, never auto-fixes) rather than a ktlint step on purpose :
    // ktlint reads `ij_kotlin_packages_to_use_import_on_demand` as IntelliJ does and would *force*
    // wildcards on listed packages on `spotlessApply`, doing the exact opposite of what we want.
    // A throwing custom step plays no formatter role — it just reports — so it's safe.
    //
    // Allowlist mirrors the wildcards already present in the codebase (run
    // `grep -rh '^import .*\.\*$' src/ | sort -u` to re-enumerate). Goal is to *shrink* this list
    // over time, not to grow it ; see the dette entry "Shrink l'allowlist `no-wildcard-imports`".
    custom("no-wildcard-imports") { content ->
      val allowed =
        setOf(
          "java.util.*",
          "jakarta.persistence.*",
          "org.junit.jupiter.api.Assertions.*",
          "org.mockito.kotlin.*",
          "org.springframework.boot.autoconfigure.condition.*",
          "org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*",
          "org.springframework.test.web.servlet.result.MockMvcResultMatchers.*",
          "org.springframework.web.bind.annotation.*",
          "com.portfolioai.analysis.application.*",
          "com.portfolioai.analysis.domain.*",
          "com.portfolioai.config.application.dto.*",
          "com.portfolioai.ingestion.application.dto.*",
          "com.portfolioai.market.domain.*",
          "com.portfolioai.portfolio.domain.*",
        )
      val regex = Regex("""^import (\S+\.\*)$""")
      val offenders =
        content
          .lineSequence()
          .mapNotNull { regex.matchEntire(it.trim())?.groupValues?.get(1) }
          .filterNot { it in allowed }
          .toList()
      if (offenders.isNotEmpty()) {
        throw GradleException(
          "Forbidden wildcard imports (extend each one explicitly via IntelliJ Optimize Imports):" +
            offenders.joinToString(separator = "\n  ", prefix = "\n  ")
        )
      }
      content
    }
  }
  kotlinGradle { ktfmt("0.62").googleStyle() }
}

// ----------------------------------------------------------------------------- Detekt
//
// Stratégie de ramp-up — `ignoreFailures = true` au démarrage : Detekt génère ses rapports
// (HTML + SARIF), la CI les uploade vers GitHub Code Scanning, mais le `./gradlew build` ne
// casse pas. Une fois la première vague de findings revue, on bascule vers `false` (et on
// génère un baseline via `./gradlew detektBaseline` pour ne plus échouer que sur le code
// nouveau si on accepte la dette existante).
//
// `buildUponDefaultConfig = true` part du jeu de règles curé livré par Detekt et **applique en
// surcouche** le fichier `config/detekt/detekt.yml` — qui assouplit les rules les plus bruyantes
// pour Kotlin/Spring/JPA (LongParameterList sur `@Entity`, WildcardImport pour
// `jakarta.persistence.*`, MagicNumber sur HTTP codes / timeouts / percentages…). Voir le fichier
// pour le détail des choix.
detekt {
  buildUponDefaultConfig = true
  allRules = false
  ignoreFailures = true
  config.setFrom("$projectDir/config/detekt/detekt.yml")
}

tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach {
  jvmTarget = "21"
  reports {
    html.required.set(true)
    // SARIF est le format que GitHub Code Scanning consomme — voir le step d'upload dans
    // `.github/workflows/backend.yml`. Les findings apparaissent dans l'onglet Security
    // alongside des résultats CodeQL.
    sarif.required.set(true)
    xml.required.set(false)
    md.required.set(false)
  }
}

tasks.withType<io.gitlab.arturbosch.detekt.DetektCreateBaselineTask>().configureEach {
  jvmTarget = "21"
}

// Detekt 1.23.x ship un compilateur Kotlin embarqué (2.0.21 dans la 1.23.8). Avec Kotlin 2.1 côté
// projet, la classpath runtime arrive avec un stdlib non-compatible et Detekt refuse de charger
// (« detekt was compiled with Kotlin 2.0.21 but is currently running with 2.1.21 »). On isole
// la classpath `detekt` sur la version Kotlin qu'il attend — n'affecte ni `compileKotlin` ni
// `compileTestKotlin` qui restent en 2.1.21. À retirer le jour où Detekt 2.0 sort en stable avec
// support natif Kotlin 2.1+. Important : la version pinned doit suivre celle attendue par la
// version de Detekt active — un bump Detekt patch peut shifter la version Kotlin embarquée
// (1.23.7 → 2.0.10, 1.23.8 → 2.0.21).
configurations
  .matching { it.name == "detekt" }
  .configureEach {
    resolutionStrategy.eachDependency {
      if (requested.group == "org.jetbrains.kotlin") {
        useVersion("2.0.21")
        because("Detekt 1.23.8 was compiled against Kotlin 2.0.21 — pin its classpath to match")
      }
    }
  }
