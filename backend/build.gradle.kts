plugins {
  kotlin("jvm") version "2.1.21"
  kotlin("plugin.spring") version "2.1.21"
  id("org.springframework.boot") version "3.5.14"
  id("io.spring.dependency-management") version "1.1.7"
  kotlin("plugin.jpa") version "2.1.21"
  id("com.diffplug.spotless") version "6.25.0"
  // Detekt — Kotlin static analysis (complexité cyclomatique, magic numbers, méthodes longues,
  // potentiels bugs). Complémentaire de Spotless qui ne fait que la mise en forme. Voir bloc
  // `detekt { … }` plus bas pour la stratégie de ramp-up.
  id("io.gitlab.arturbosch.detekt") version "1.23.7"
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
  implementation("org.flywaydb:flyway-core")
  implementation("org.flywaydb:flyway-database-postgresql")
  implementation("org.jetbrains.kotlin:kotlin-reflect")
  implementation("com.rometools:rome:2.1.0")
  implementation("org.apache.commons:commons-csv:1.14.1")
  runtimeOnly("org.postgresql:postgresql")
  developmentOnly("org.springframework.boot:spring-boot-devtools")
  testImplementation("org.springframework.boot:spring-boot-starter-test")
  testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
  // Kotlin-friendly matchers for Mockito (any(), eq(), times() that respect Kotlin's non-null
  // types — the Java equivalents return `null` for non-nullable parameters and crash).
  testImplementation("org.mockito.kotlin:mockito-kotlin:5.4.0")
  // Local HTTP server for testing outbound clients without hitting the real internet — used by
  // YahooClientTest to assert rate-limit / 404 / browser-headers behaviour deterministically.
  testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin { compilerOptions { freeCompilerArgs.addAll("-Xjsr305=strict") } }

allOpen {
  annotation("jakarta.persistence.Entity")
  annotation("jakarta.persistence.MappedSuperclass")
  annotation("jakarta.persistence.Embeddable")
}

tasks.withType<Test> { useJUnitPlatform() }

spotless {
  kotlin {
    ktfmt("0.55").googleStyle()
    target("src/**/*.kt")
  }
  kotlinGradle { ktfmt("0.55").googleStyle() }
}

// ----------------------------------------------------------------------------- Detekt
//
// Stratégie de ramp-up — `ignoreFailures = true` au démarrage : Detekt génère ses rapports
// (HTML + SARIF), la CI les uploade vers GitHub Code Scanning, mais le `./gradlew build` ne
// casse pas. Une fois la première vague de findings revue, on bascule vers `false` (et on
// génère un baseline via `./gradlew detektBaseline` pour ne plus échouer que sur le code
// nouveau si on accepte la dette existante).
//
// `buildUponDefaultConfig = true` part du jeu de règles curé livré par Detekt — c'est le bon
// défaut pour un projet qui n'a pas encore de config maison. `allRules = false` exclut les
// règles expérimentales/opt-in pour limiter le bruit initial.
detekt {
  buildUponDefaultConfig = true
  allRules = false
  ignoreFailures = true
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
