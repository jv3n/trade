plugins {
  kotlin("jvm") version "2.1.21"
  kotlin("plugin.spring") version "2.3.21"
  id("org.springframework.boot") version "3.5.16"
  id("io.spring.dependency-management") version "1.1.7"
  kotlin("plugin.jpa") version "2.1.21"
  id("com.diffplug.spotless") version "6.25.0"
  // Detekt — Kotlin static analysis (cyclomatic complexity, magic numbers, long methods,
  // potential bugs). Complements Spotless, which only handles formatting. See the `detekt { … }`
  // block below for the ramp-up strategy.
  id("io.gitlab.arturbosch.detekt") version "1.23.8"
  // Kover — Kotlin test coverage (replaces JaCoCo for pure Kotlin DSL projects). Instruments the
  // `test` task automatically; reports are generated on demand via `koverHtmlReport` /
  // `koverXmlReport`. See the `kover { … }` block below for the excludes configuration (entry
  // point, DTOs, etc. that carry no testable logic).
  id("org.jetbrains.kotlinx.kover") version "0.9.9"
  // gradle-git-properties — generates `git.properties` in the jar at build time, consumed by
  // Spring Boot Actuator to populate `/actuator/info > git` (commit SHA, branch, build time).
  // Combined with `springBoot { buildInfo() }` below, the endpoint returns version + commit + time
  // without mounting a configMap or exposing a custom env var. Lightweight (~5 KB extra in the
  // jar).
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

// ----------------------------------------------------------------------------- build dir (WSL)
//
// When `GRADLE_BUILD_DIR` is set, redirect Gradle's entire build output there instead of the
// in-tree `build/`. The Tiltfile sets it **only on WSL2**, where the repo lives on a `/mnt/c`
// (DrvFs) mount: Windows file semantics forbid deleting a file still held open by another process,
// so a lingering `bootRun` JVM keeping `.class` files open makes the next `compileKotlin` fail with
// `java.io.IOException: Could not delete .../build/classes/kotlin/main/com`. Pointing the output at
// the native ext4 filesystem (where POSIX `unlink` succeeds on open files) removes the whole
// failure class. Unset in CI and the prod Docker build — the repo already sits on ext4 there, so
// the default in-tree `build/` is used and nothing changes.
System.getenv("GRADLE_BUILD_DIR")
  ?.takeIf { it.isNotBlank() }
  ?.let { dir -> layout.buildDirectory.set(file(dir)) }

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
  implementation("io.sentry:sentry-spring-boot-starter-jakarta:8.50.1")
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

// Enables generation of `META-INF/build-info.properties`, read at boot by Spring Boot Actuator
// (populates `/actuator/info > build` with group/artifact/name/version/time). Paired with the
// `com.gorylenko.gradle-git-properties` plugin above, which adds the `git` section. No extra
// configuration required — `version` comes from the `version = "…"` block above, `group` comes
// from `group = "com.portfolioai"`.
springBoot { buildInfo() }

// gradle-git-properties — explicit configuration of the fields exposed via `/actuator/info > git`.
// By default the plugin only generates `git.branch + git.commit.id + git.commit.time`; we add
// `git.commit.message.short` and `git.tags`, which are useful to correlate a Cloud Run revision to
// a release tag without grepping the commit SHA. `dotGitDirectory` points to `../.git` because the
// Gradle project lives in `backend/` but the `.git` is at the repo root.
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
  // `failOnNoGitDirectory = false` avoids breaking the build in non-git contexts (tarball, corrupt
  // worktree) — the `git` section of the payload will simply be absent.
  failOnNoGitDirectory = false
}

// Integration tests boot their own Postgres via Testcontainers (`testsupport/PostgresContainer.kt`)
// so `./gradlew test` no longer depends on Tilt / docker-compose for a running DB — Docker is the
// only host prerequisite. The previous `.env` loader (which forwarded `POSTGRES_HOST_PORT` to the
// test JVM so `@SpringBootTest` would hit the Tilt-managed Postgres) was retired 2026-05-24; the
// JUnit Platform launcher listener in `testsupport/TestcontainersBootstrap.kt` overrides the JDBC
// coordinates as system properties before any Spring context loads.
tasks.withType<Test> { useJUnitPlatform() }

// ----------------------------------------------------------------------------- bootRun (dev)
//
// `bootRun` forks its own JVM — `org.gradle.jvmargs` (gradle.properties) does not touch it, it
// configures the Gradle/Kotlin daemons. Here we speed up the startup of that dev JVM by capping
// JIT compilation at the C1 level (`-XX:TieredStopAtLevel=1`): no profiling, no C2 compilation,
// which reduces warmup time at boot. Steady-state throughput is lower (C1 only), which is
// irrelevant for local dev where we restart often and request latency is not a criterion. **Local
// only**: the prod `bootJar` is unaffected — only the `bootRun` task (never used in prod) gets
// this flag.
tasks.withType<org.springframework.boot.gradle.tasks.run.BootRun> {
  jvmArgs("-XX:TieredStopAtLevel=1")
}

spotless {
  kotlin {
    ktfmt("0.62").googleStyle()
    target("src/**/*.kt")
    // Forbid every wildcard import — no allowlist. Implemented as a custom check (read-only —
    // throws on detection, never auto-fixes) rather than a ktlint step on purpose: ktlint reads
    // `ij_kotlin_packages_to_use_import_on_demand` as IntelliJ does and would *force* wildcards on
    // listed packages on `spotlessApply`, doing the exact opposite of what we want. A throwing
    // custom step plays no formatter role — it just reports — so it's safe.
    //
    // The previous allowlist (14 entries spanning `java.util.*`, JPA, JUnit, mockito-kotlin,
    // Spring web, MockMvc helpers, plus 7 project-internal packages) was kept as a safety net
    // back when wildcard imports were sprinkled across the codebase. Tech-debt ticket #10
    // (delivered 2026-05-15) verified that **zero** wildcard imports remain in any `.kt` file (grep
    // -rEn
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
// Ramp-up strategy — `ignoreFailures = true` to start with: Detekt generates its reports
// (HTML + SARIF), CI uploads them to GitHub Code Scanning, but `./gradlew build` does not break.
// Once the first wave of findings has been reviewed, we flip it to `false` (and generate a
// baseline via `./gradlew detektBaseline` so only new code fails if we accept the existing debt).
//
// `buildUponDefaultConfig = true` starts from the curated rule set shipped by Detekt and **layers
// on top** the `config/detekt/detekt.yml` file — which relaxes the noisiest rules for
// Kotlin/Spring/JPA (LongParameterList on `@Entity`, WildcardImport for `jakarta.persistence.*`,
// MagicNumber on HTTP codes / timeouts / percentages…). See the file for the detailed choices.
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
    // SARIF is the format GitHub Code Scanning consumes — see the upload step in
    // `.github/workflows/backend.yml`. Findings show up in the Security tab alongside the CodeQL
    // results.
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
// Coverage measured on the standard `test` task; no blocking threshold for now — we publish the
// report (HTML for browsing, XML for the GitHub Actions step summary) and tune if coverage drops
// unexpectedly. Excludes target code that carries no testable logic (Spring entry point, vendor
// model container classes, Jackson DTOs) — a file with only annotations + accessors artificially
// inflates the denominator.
//
// To browse locally after `./gradlew test koverHtmlReport`: open
// `backend/build/reports/kover/html/index.html`.
kover {
  reports {
    filters {
      excludes {
        // Spring Boot application entry point — `runApplication<App>(*args)` has no useful testable
        // surface; the context-startup instrumentation covers it indirectly.
        classes("com.portfolioai.BackendApplication", "com.portfolioai.BackendApplicationKt")
        // Vendor wire-format models: Jackson data classes whose testable value lives in the
        // neighbouring mappers (tested via `MockWebServer`). Including the data classes themselves
        // double-counts the coverage already gained through the mappers.
        classes(
          "com.portfolioai.market.infrastructure.market.TwelveData*",
          "com.portfolioai.market.infrastructure.market.Finnhub*Models*",
          "com.portfolioai.news.infrastructure.news.Finnhub*Models*",
          "com.portfolioai.analyst.infrastructure.analyst.Finnhub*Response*",
          "com.portfolioai.earnings.infrastructure.earnings.Finnhub*Response*",
        )
        // Application DTOs (REST surface) — the controllers exercise them end-to-end via the
        // `@WebMvcTest` tests. Indirect but sufficient coverage.
        packages("com.portfolioai.*.application.dto")
      }
    }
  }
}

// Detekt 1.23.x ships an embedded Kotlin compiler (2.0.21 in 1.23.8). With Kotlin 2.1 on the
// project side, the runtime classpath ends up with an incompatible stdlib and Detekt refuses to
// load ("detekt was compiled with Kotlin 2.0.21 but is currently running with 2.1.21"). We isolate
// the `detekt` classpath on the Kotlin version it expects — this affects neither `compileKotlin`
// nor `compileTestKotlin`, which stay on 2.1.21. Remove this the day Detekt 2.0 ships stable with
// native Kotlin 2.1+ support. Important: the pinned version must track the one expected by the
// active Detekt version — a Detekt patch bump can shift the embedded Kotlin version
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
