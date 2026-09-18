package com.portfolioai.testsupport

import org.junit.platform.launcher.LauncherSession
import org.junit.platform.launcher.LauncherSessionListener

/**
 * JUnit Platform listener that boots [PostgresContainer] **once per JVM**, before any test class
 * loads. Auto-discovered via the SPI declaration in
 * `src/test/resources/META-INF/services/org.junit.platform.launcher.LauncherSessionListener`, so no
 * annotation, no `@ExtendWith`, no per-class plumbing is required — `@SpringBootTest` classes see
 * the datasource coordinates as system properties when their context bootstraps.
 *
 * Why a launcher-session listener and not a `BeforeAllCallback` — `BeforeAllCallback` fires
 * per-class and would re-trigger property publishing on every class ; the launcher session opens
 * exactly once for the whole `./gradlew test` invocation, which matches the singleton's lifecycle.
 */
class TestcontainersBootstrap : LauncherSessionListener {

  override fun launcherSessionOpened(session: LauncherSession) {
    PostgresContainer.bootstrap()
  }
}
