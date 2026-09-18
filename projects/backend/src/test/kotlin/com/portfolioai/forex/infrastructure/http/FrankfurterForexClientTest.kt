package com.portfolioai.forex.infrastructure.http

import com.portfolioai.shared.UpstreamUnavailableException
import java.math.BigDecimal
import java.time.LocalDate
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.web.client.RestClient

/**
 * Tests on [FrankfurterForexClient] against a local [MockWebServer]. Pins:
 * - **Happy path** : `rates[quote]` → the rate, `date` → `asOf`, both parsed onto the domain value.
 * - **Fail-soft** : a 5xx surfaces as [UpstreamUnavailableException] (→ 503) rather than a
 *   fabricated rate — the account page falls back to USD on its side, it must never show a wrong
 *   CAD figure.
 * - **Missing pair** : a 200 whose `rates` lacks the requested quote is treated as a failure, not a
 *   silent zero.
 * - **Same-day cache** : a second call for the same pair is served from the in-memory cache, firing
 *   no second HTTP request (courteous to the keyless upstream).
 */
class FrankfurterForexClientTest {

  private lateinit var server: MockWebServer

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()
  }

  @AfterEach
  fun tearDown() {
    server.shutdown()
  }

  private fun client(): FrankfurterForexClient =
    FrankfurterForexClient(
      rest = RestClient.builder().build(),
      baseUrl = server.url("/").toString().trimEnd('/'),
    )

  @Test
  fun `maps the quote rate and publish date from a latest response`() {
    server.enqueue(
      jsonOk("""{"amount":1.0,"base":"USD","date":"2026-06-15","rates":{"CAD":1.3712}}""")
    )

    val rate = client().latest("USD", "CAD")

    assertEquals(0, BigDecimal("1.3712").compareTo(rate.rate))
    assertEquals("CAD", rate.quote)
    assertEquals(LocalDate.of(2026, 6, 15), rate.asOf)
  }

  @Test
  fun `surfaces a 5xx as UpstreamUnavailable rather than inventing a rate`() {
    server.enqueue(MockResponse().setResponseCode(503))

    assertThrows<UpstreamUnavailableException> { client().latest("USD", "CAD") }
  }

  @Test
  fun `treats a response missing the requested quote as a failure`() {
    // 200 OK but the rates map has no CAD — a silent 0 would corrupt the displayed balance.
    server.enqueue(
      jsonOk("""{"amount":1.0,"base":"USD","date":"2026-06-15","rates":{"EUR":0.92}}""")
    )

    assertThrows<UpstreamUnavailableException> { client().latest("USD", "CAD") }
  }

  @Test
  fun `serves a repeated pair from cache, firing a single upstream request`() {
    server.enqueue(
      jsonOk("""{"amount":1.0,"base":"USD","date":"2026-06-15","rates":{"CAD":1.37}}""")
    )
    val client = client()

    client.latest("USD", "CAD")
    client.latest("USD", "CAD") // second call — must hit the cache, not the server

    assertEquals(1, server.requestCount)
  }

  private fun jsonOk(body: String) =
    MockResponse().setHeader("Content-Type", "application/json").setBody(body)
}
