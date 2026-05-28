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
  // Kover — couverture de tests Kotlin (replaces JaCoCo pour les projets Kotlin DSL purs).
  // S'instrumente automatiquement sur le `test` task ; les rapports sont générés à la demande
  // via `koverHtmlReport` / `koverXmlReport`. Voir bloc `kover { … }` plus bas pour la
  // configuration des excludes (entry point, DTOs, etc. qui ne portent pas de logique testable).
  id("org.jetbrains.kotlinx.kover") version "0.9.8"
  // gradle-git-properties — génère `git.properties` dans le jar au build, consommé par Spring Boot
  // Actuator pour peupler `/actuator/info > git` (commit SHA, branche, build time). Combiné avec
  // `springBoot { buildInfo() }` plus bas, l'endpoint retourne version + commit + time sans avoir
  // à mounter de configMap ou exposer une env var custom. Léger (~5 KB de plus dans le jar).
  id("com.gorylenko.gradle-git-properties") version "2.5.7"
}

group = "com.portfolioai"

// Version is overridable via `-Pversion=…` from the CLI / CI. The Cloud Run deploy workflow
// (`.github/workflows/deploy.yml`) passes the GitHub Release tag as `APP_VERSION` build-arg →
// `./gradlew bootJar -Pversion=$APP_VERSION` → ends up in `META-INF/build-info.properties` via
// `springBoot.buildInfo()` → surfaced as `build.version` on `/actuator/info`. Fallback default
// `0.0.0-SNAPSHOT` covers local dev / Tilt where no version is passed.
version =
  (project.findProperty("version") as? String)?.takeIf { it.isNotBlank() && it != "unspecified" }
    ?: "0.0.0-SNAPSHOT"

java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }

repositories { mavenCentral() }

dependencies {
  implementation("org.springframework.boot:spring-boot-starter-actuator")
  implementation("org.springframework.boot:spring-boot-starter-cache")
  implementation("org.springframework.boot:spring-boot-starter-data-jpa")
  implementation("org.springframework.boot:spring-boot-starter-security")
  implementation("org.springframework.boot:spring-boot-starter-oauth2-client")
  implementation("org.springframework.boot:spring-boot-starter-web")
  implementation("com.github.ben-manes.caffeine:caffeine")
  implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
  // springdoc-openapi — auto-generates an OpenAPI 3.0 schema from Spring controllers + Jackson DTOs
  // and serves Swagger UI at /swagger-ui.html. Activated only in the `local` profile (see
  // application-local.yml) ; the root application.yml keeps both `springdoc.api-docs.enabled` and
  // `springdoc.swagger-ui.enabled` to false so no env reachable from the outside ever exposes the
  // schema. Surfaced in Tilt as a link on the `backend` resource for one-click access during dev.
  implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.17")
  implementation("org.flywaydb:flyway-core")
  implementation("org.flywaydb:flyway-database-postgresql")
  implementation("org.jetbrains.kotlin:kotlin-reflect")
  implementation("org.apache.commons:commons-csv:1.14.1")
  // Sentry SDK — error tracking + breadcrumbs + user context. Points at GlitchTip via `sentry.dsn`
  // (Sentry-compatible ingest API) in prod ; no-op when the DSN is empty (dev local default). The
  // Spring Boot starter auto-instruments uncaught controller exceptions and pulls in the Logback
  // appender so MDC values (notably `userId`) become event extras automatically. The `-jakarta`
  // variant targets Spring Boot 3 (Jakarta EE) — picking `sentry-spring-boot-starter` (no suffix)
  // would silently link the javax-namespaced classes and the bean wiring would crash at boot.
  implementation("io.sentry:sentry-spring-boot-starter-jakarta:8.43.0")
  runtimeOnly("org.postgresql:postgresql")
  developmentOnly("org.springframework.boot:spring-boot-devtools")
  testImplementation("org.springframework.boot:spring-boot-starter-test")
  testImplementation("org.springframework.security:spring-security-test")
  testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
  // Kotlin-friendly matchers for Mockito (any(), eq(), times() that respect Kotlin's non-null
  // types — the Java equivalents return `null` for non-nullable parameters and crash).
  testImplementation("org.mockito.kotlin:mockito-kotlin:5.4.0")
  // Local HTTP server for testing outbound clients without hitting the real internet — used by
  // TwelveDataClientTest and FinnhubClientTest to assert rate-limit / 404 / auth-failure
  // behaviour deterministically.
  testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
  // Testcontainers — boots a real Postgres in Docker for `@SpringBootTest` integration tests so
  // `./gradlew test` no longer needs Tilt / docker-compose orchestrated by the dev infra. A single
  // container is shared across the JVM via a JUnit Platform LauncherSessionListener (singleton in
  // `testsupport/PostgresContainer.kt`) and stays warm between runs when the dev opts into reuse
  // (`testcontainers.reuse.enable=true` in `~/.testcontainers.properties`). Docker is the only
  // host-side prerequisite — already required for Tilt anyway.
  testImplementation("org.testcontainers:postgresql:1.21.4")
  testImplementation("org.testcontainers:junit-jupiter:1.21.4")
  // Promoted from testRuntimeOnly → testImplementation 2026-05-24 : `TestcontainersBootstrap`
  // implements `LauncherSessionListener` (the SPI hook that boots the Postgres container before
  // any test class loads), which needs the launcher API visible at compile time. The runtime SPI
  // discovery still works — `testImplementation` is a strict superset.
  testImplementation("org.junit.platform:junit-platform-launcher")
}

kotlin {
  compilerOptions {
    freeCompilerArgs.addAll(
      "-Xjsr305=strict",
      // Opt-in to the future Kotlin default for annotations on constructor parameters
      // (KT-73255). Today they apply to the value parameter only ; the future default applies
      // them to both the parameter and the generated backing property/field. Every Spring
      // annotation we put on a constructor param (`@Qualifier`, `@Value`, `@Inject`, …) works
      // fine on both targets, so adopting the future behavior now silences the deprecation
      // warning fleet across the 18 affected files (`Routing*Client`, `*Service` ctor params,
      // `@Value` injected configs) without breaking a single bean wiring. When the Kotlin
      // version flips the default, this flag becomes a no-op and can be dropped.
      "-Xannotation-default-target=param-property",
    )
  }
}

allOpen {
  annotation("jakarta.persistence.Entity")
  annotation("jakarta.persistence.MappedSuperclass")
  annotation("jakarta.persistence.Embeddable")
}

// Active la génération de `META-INF/build-info.properties` lue au boot par Spring Boot Actuator
// (peuple `/actuator/info > build` avec group/artifact/name/version/time). Couplé avec le plugin
// `com.gorylenko.gradle-git-properties` plus haut qui ajoute la section `git`. Pas de
// configuration supplémentaire requise — la `version` vient du bloc `version = "…"` ci-dessus,
// `group` vient de `group = "com.portfolioai"`.
springBoot { buildInfo() }

// gradle-git-properties — configuration explicite des champs exposés via `/actuator/info > git`.
// Par défaut le plugin ne génère que `git.branch + git.commit.id + git.commit.time` ; on ajoute
// `git.commit.message.short` et `git.tags` qui sont utiles pour corréler une révision Cloud Run
// à un tag de release sans avoir à grep le commit SHA. `dotGitDirectory` pointe vers `../.git`
// parce que le projet Gradle vit dans `backend/` mais le `.git` est à la racine du repo.
gitProperties {
  dotGitDirectory.set(file("../.git"))
  keys =
    listOf(
      "git.branch",
      "git.commit.id",
      "git.commit.id.abbrev",
      "git.commit.time",
      "git.commit.message.short",
      "git.tags",
    )
  // `failOnNoGitDirectory = false` évite de casser le build dans les contextes hors-git (tarball,
  // worktree corrompu) — la section `git` du payload sera simplement absente.
  failOnNoGitDirectory = false
}

// Integration tests boot their own Postgres via Testcontainers (`testsupport/PostgresContainer.kt`)
// so `./gradlew test` no longer depends on Tilt / docker-compose for a running DB — Docker is the
// only host prerequisite. The previous `.env` loader (which forwarded `POSTGRES_HOST_PORT` to the
// test JVM so `@SpringBootTest` would hit the Tilt-managed Postgres) was retired 2026-05-24 ; the
// JUnit Platform launcher listener in `testsupport/TestcontainersBootstrap.kt` overrides the JDBC
// coordinates as system properties before any Spring context loads.
tasks.withType<Test> { useJUnitPlatform() }

spotless {
  kotlin {
    ktfmt("0.62").googleStyle()
    target("src/**/*.kt")
    // Forbid every wildcard import — no allowlist. Implemented as a custom check (read-only —
    // throws on detection, never auto-fixes) rather than a ktlint step on purpose : ktlint reads
    // `ij_kotlin_packages_to_use_import_on_demand` as IntelliJ does and would *force* wildcards on
    // listed packages on `spotlessApply`, doing the exact opposite of what we want. A throwing
    // custom step plays no formatter role — it just reports — so it's safe.
    //
    // The previous allowlist (14 entries spanning `java.util.*`, JPA, JUnit, mockito-kotlin,
    // Spring web, MockMvc helpers, plus 7 project-internal packages) was kept as a safety net
    // back when wildcard imports were sprinkled across the codebase. Dette ticket #10 (livré
    // 2026-05-15) verified that **zero** wildcard imports remain in any `.kt` file (grep -rEn
    // "^import [^ ]+\\.\\*( |$)" backend/src — returns empty) and that the `.editorconfig` at the
    // repo root pins `ij_kotlin_name_count_to_use_star_import = Int.MAX_VALUE` so IntelliJ can't
    // reintroduce them spontaneously on Optimize Imports. The allowlist was therefore vestigial
    // and got dropped — if a wildcard ever sneaks back in (developer with non-conformant IDE
    // settings, copy-paste from a sample), Spotless catches it here.
    custom("no-wildcard-imports") { content ->
      val regex = Regex("""^import (\S+\.\*)$""")
      val offenders =
        content
          .lineSequence()
          .mapNotNull { regex.matchEntire(it.trim())?.groupValues?.get(1) }
          .toList()
      if (offenders.isNotEmpty()) {
        throw GradleException(
          "Forbidden wildcard imports (expand each one explicitly via IntelliJ Optimize Imports):" +
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

// ----------------------------------------------------------------------------- Kover
//
// Couverture mesurée sur le `test` task standard ; pas de seuil bloquant pour l'instant — on
// publie le rapport (HTML pour browsing, XML pour le step summary GitHub Actions) et on tune si
// la couverture descend de manière inattendue. Excludes ciblés sur le code qui ne porte pas de
// logique testable (entry point Spring, classes-conteneur de modèles vendor, DTOs Jackson) — un
// fichier qui n'a que des annotations + accesseurs gonfle artificiellement le dénominateur.
//
// Pour browser localement après `./gradlew test koverHtmlReport` : ouvrir
// `backend/build/reports/kover/html/index.html`.
kover {
  reports {
    filters {
      excludes {
        // Spring Boot application entry point — `runApplication<App>(*args)` n'a pas de surface
        // testable utile, l'instrumentation au démarrage du contexte le couvre indirectement.
        classes("com.portfolioai.BackendApplication", "com.portfolioai.BackendApplicationKt")
        // Vendor wire-format models : data classes Jackson dont la valeur testable est dans les
        // mappers voisins (testés via `MockWebServer`). Inclure les data classes elles-mêmes
        // double-compte la couverture déjà acquise via les mappers.
        classes(
          "com.portfolioai.market.infrastructure.market.TwelveData*",
          "com.portfolioai.market.infrastructure.market.Finnhub*Models*",
          "com.portfolioai.news.infrastructure.news.Finnhub*Models*",
          "com.portfolioai.analyst.infrastructure.analyst.Finnhub*Response*",
          "com.portfolioai.earnings.infrastructure.earnings.Finnhub*Response*",
        )
        // DTOs applicatifs (REST surface) — les controllers les exercent end-to-end via les tests
        // `@WebMvcTest`. Couverture indirecte mais suffisante.
        packages("com.portfolioai.*.application.dto")
      }
    }
  }
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
