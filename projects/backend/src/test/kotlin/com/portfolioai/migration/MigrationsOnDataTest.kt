package com.portfolioai.migration

import com.portfolioai.testsupport.PostgresContainer
import java.math.BigDecimal
import java.sql.Connection
import java.sql.DriverManager
import java.sql.SQLException
import java.util.UUID
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/**
 * Runs the data migrations against a database that **already holds rows** (#657). The integration
 * tests migrate an empty database once, where every `UPDATE` touches nothing — so a migration that
 * rewrites data in the wrong order against its schema change passes CI and fails at deploy. That is
 * how `v2.15.0-rc1` never started on staging : V23 cleared the DT premarket before dropping the
 * `NOT NULL` (#649, #656).
 *
 * Each test gets a database of its own on the shared container — the migrations write `public.` in
 * full, so a schema would not isolate them — migrates it **up to the version before** the one under
 * test, seeds the rows that migration rewrites, migrates to the latest and reads the result. No
 * Spring : Flyway is driven directly with the application's settings.
 *
 * To cover a new data migration : one test, seeded at the version before it.
 */
class MigrationsOnDataTest {

  private val database = "migration_" + UUID.randomUUID().toString().replace("-", "").take(12)
  private val url =
    "jdbc:postgresql://${PostgresContainer.host}:${PostgresContainer.getMappedPort(5432)}/$database"

  @BeforeEach
  fun createDatabase() {
    admin { it.createStatement().use { s -> s.execute("CREATE DATABASE $database") } }
  }

  @AfterEach
  fun dropDatabase() {
    admin { it.createStatement().use { s -> s.execute("DROP DATABASE IF EXISTS $database") } }
  }

  @Test
  fun `V23 clears the premarket of the existing double tops and leaves the other stats theirs`() {
    // Staging held FRESH1 on 2026-10-10 : a DT with its three premarket prices.
    migrateTo("22")
    val user = seedUser()
    val dt = seedStat(user, pattern = "DT", ticker = "FRESH1", dtStart = "2.34")
    val gus = seedStat(user, pattern = "GUS", ticker = "KTTA")
    // The discretionary stat left in production before #648 : a session pattern, it keeps its own.
    val discretionary = seedStat(user, pattern = "DISCRETIONARY", ticker = "KTTA")

    migrateTo(LATEST)

    connect { c ->
      val (dtPremarket, dtFloat) = premarketAndFloat(c, dt)
      assertEquals(listOf(null, null, null), dtPremarket, "a double top carries no premarket")
      assertEquals(0, BigDecimal("3.10").compareTo(dtFloat), "float and volume stay")
      assertEquals(PREMARKET, premarketAndFloat(c, gus).first)
      assertEquals(PREMARKET, premarketAndFloat(c, discretionary).first)
    }
  }

  @Test
  fun `after V23 the database refuses a DT with a premarket, and another pattern without one`() {
    migrateTo(LATEST)
    val user = seedUser()

    assertThrows(SQLException::class.java) {
      seedStat(user, pattern = "DT", ticker = "SGBX", dtStart = "1.90")
    }
    assertThrows(SQLException::class.java) {
      connect { c ->
        c.createStatement().use {
          it.execute(
            "INSERT INTO stat_entry (user_id, trade_date, pattern, ticker) " +
              "VALUES ('$user', DATE '2026-09-17', 'GUS', 'KTTA')"
          )
        }
      }
    }
    // The shape it does accept : a double top with no premarket at all.
    connect { c ->
      c.createStatement().use {
        it.execute(
          "INSERT INTO stat_entry (user_id, trade_date, pattern, ticker, dt_start_price) " +
            "VALUES ('$user', DATE '2026-09-18', 'DT', 'NXTT', 1.75)"
        )
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Plumbing
  // ---------------------------------------------------------------------------

  /** The application's Flyway settings (`application.yml`), stopped at [target]. */
  private fun migrateTo(target: String) {
    Flyway.configure()
      .dataSource(url, PostgresContainer.username, PostgresContainer.password)
      .locations("classpath:db/migration")
      .baselineOnMigrate(true)
      .baselineVersion("0")
      .target(target)
      .load()
      .migrate()
  }

  private fun seedUser(): UUID {
    val id = UUID.randomUUID()
    connect { c ->
      c.createStatement().use {
        it.execute(
          "INSERT INTO app_user (id, email, provider, role) " +
            "VALUES ('$id', 'trader-$id@test.local', 'test', 'USER')"
        )
      }
    }
    return id
  }

  /** KTTA's premarket of `mockup/PARCOURS.md` (2.65 / 4.05 / 4.65), float 3.10 M. */
  private fun seedStat(user: UUID, pattern: String, ticker: String, dtStart: String? = null): UUID {
    val id = UUID.randomUUID()
    connect { c ->
      c.createStatement().use {
        it.execute(
          "INSERT INTO stat_entry (id, user_id, trade_date, pattern, ticker, previous_close, " +
            "pm_open, pm_high, float_millions, dt_start_price) VALUES ('$id', '$user', " +
            "DATE '2026-09-17', '$pattern', '$ticker', 2.65, 4.05, 4.65, 3.10, ${dtStart ?: "NULL"})"
        )
      }
    }
    return id
  }

  private fun premarketAndFloat(c: Connection, stat: UUID): Pair<List<BigDecimal?>, BigDecimal?> =
    c.createStatement().use { s ->
      s.executeQuery(
          "SELECT previous_close, pm_open, pm_high, float_millions FROM stat_entry WHERE id = '$stat'"
        )
        .use { rs ->
          rs.next()
          listOf(rs.getBigDecimal(1), rs.getBigDecimal(2), rs.getBigDecimal(3)).map {
            it?.stripTrailingZeros()
          } to rs.getBigDecimal(4)
        }
    }

  private fun <T> connect(block: (Connection) -> T): T =
    DriverManager.getConnection(url, PostgresContainer.username, PostgresContainer.password)
      .use(block)

  /** The container's own database — the one a database is created and dropped from. */
  private fun admin(block: (Connection) -> Unit) =
    DriverManager.getConnection(
        PostgresContainer.jdbcUrl,
        PostgresContainer.username,
        PostgresContainer.password,
      )
      .use(block)

  private companion object {
    const val LATEST = "latest"
    val PREMARKET: List<BigDecimal?> =
      listOf(BigDecimal("2.65"), BigDecimal("4.05"), BigDecimal("4.65")).map {
        it.stripTrailingZeros()
      }
  }
}
