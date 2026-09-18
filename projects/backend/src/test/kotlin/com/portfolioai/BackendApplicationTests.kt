package com.portfolioai

import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest

/**
 * Smoke test : the full Spring context boots cleanly with no env var set, the way a fresh clone
 * would.
 *
 * No `@TestPropertySource` here on purpose : if anyone introduces a placeholder without a default
 * in the YAML, this test starts failing in CI exactly the way a fresh clone would.
 */
@SpringBootTest
class BackendApplicationTests {

  @Test fun contextLoads() {}
}
