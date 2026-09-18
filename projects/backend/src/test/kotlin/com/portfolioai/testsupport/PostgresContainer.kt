package com.portfolioai.testsupport

import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName

/**
 * Singleton Postgres container shared across every integration test in the JVM. Boots once at
 * launcher-session open (see [TestcontainersBootstrap]) and exposes its JDBC coordinates as system
 * properties so Spring picks them up via relaxed binding **before** any `@SpringBootTest` context
 * load — no per-class `@Import` / `@DynamicPropertySource` plumbing required.
 *
 * Reuse — `withReuse(true)` keeps the container alive between `./gradlew test` runs when the dev
 * has opted in globally via `~/.testcontainers.properties` (`testcontainers.reuse.enable=true`).
 * Without the opt-in Testcontainers silently ignores the flag and spins a fresh container each run
 * (~5 s overhead). Either way the tests are fully decoupled from Tilt / docker-compose.
 *
 * Image pinned to `postgres:16` — the CI used to provision the same image via the `services:` block
 * in `.github/workflows/backend.yml`. Prod (Supabase) runs PG 15 ; a one-major buffer on the test
 * client is fine, dump/restore stays compatible.
 */
object PostgresContainer :
  PostgreSQLContainer<PostgresContainer>(DockerImageName.parse("postgres:16")) {

  init {
    withDatabaseName(DB_NAME)
    withUsername(DB_USER)
    withPassword(DB_PASS)
    withReuse(true)
  }

  /**
   * Boots the container on first reference and publishes its coordinates to system properties.
   * Idempotent — calling twice is a no-op (`start()` itself returns instantly on a running
   * container).
   */
  fun bootstrap() {
    if (!isRunning) {
      start()
    }
    System.setProperty("spring.datasource.url", jdbcUrl)
    System.setProperty("spring.datasource.username", username)
    System.setProperty("spring.datasource.password", password)
  }

  private const val DB_NAME = "portfolioai"
  private const val DB_USER = "portfolioai"
  private const val DB_PASS = "portfolioai"
}
