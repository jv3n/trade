package com.portfolioai

import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.TestPropertySource

@SpringBootTest
@TestPropertySource(properties = ["anthropic.api.key=test-key-ci-only"])
class BackendApplicationTests {

  @Test fun contextLoads() {}
}
