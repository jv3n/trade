package com.portfolioai

import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest

/**
 * Smoke test : the full Spring context boots cleanly. Doubles as a regression on the audit
 * 2026-05-10 finding #1 — `application.yml` must declare `anthropic.api.key` with an empty default
 * (`${'$'}{ANTHROPIC_API_KEY:}`) so a fresh clone with no env var set still boots, mirroring the
 * convention already in place for the Twelve Data and Finnhub keys. Without that default Spring
 * fails the placeholder resolution before `@Value` injection runs, and the user can never reach the
 * `/settings/configuration` page to rent the key in the SECRET runtime slot.
 *
 * No `@TestPropertySource` here on purpose : if anyone re-introduces the missing default in the
 * YAML, this test starts failing in CI exactly the way a fresh clone would.
 */
@SpringBootTest
class BackendApplicationTests {

  @Test fun contextLoads() {}
}
