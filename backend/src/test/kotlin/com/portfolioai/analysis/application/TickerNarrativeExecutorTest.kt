package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.PromptTemplate
import com.portfolioai.analysis.domain.Sentiment
import com.portfolioai.analysis.domain.TickerNarrativeSnapshot
import com.portfolioai.analysis.infrastructure.llm.LlmClient
import com.portfolioai.market.application.TickerService
import com.portfolioai.market.domain.Indicators
import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.market.domain.TickerQuote
import com.portfolioai.market.domain.TickerSnapshot
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.eq
import org.mockito.kotlin.isNull
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify

/**
 * Tests on [TickerNarrativeExecutor] focused on the **score-tracking semantics** introduced in
 * Phase 3 PR2 (the parse / validate / retry loop itself was already pinned indirectly via
 * `TickerNarrativeServiceTest` and the parser/validator unit tests).
 *
 * The executor is the only place that *measures* `retry_count` / `parse_failed` /
 * `validator_failed` ; the recorder ([PromptScoreRecorder]) just forwards what it's handed. A
 * regression that mis-increments the counter, or mis-flags a path, would not surface in any other
 * test — these specs are the safety net.
 *
 * What we pin :
 *
 * - **Success on first attempt** → `retry_count = 0`, both flags false, recorder receives the saved
 *   snapshot id. Smoke test the happy path : no retry was paid for, no flag was raised.
 * - **Parser fails attempt 1 then succeeds attempt 2** → `retry_count = 1`, `parse_failed = true`,
 *   `validator_failed = false`. The retry counter increments *because* attempt 1 ended in a parse
 *   failure that triggered a re-prompt.
 * - **Validator returns Invalid attempt 1 then Valid attempt 2** → `retry_count = 1`, `parse_failed
 *   = false`, `validator_failed = true`. Same retry semantics, flag isolated to validator.
 * - **Both attempts fail validation** → executor throws, but the recorder is STILL called in the
 *   `finally` with `snapshot_id = null`, `validator_failed = true`, `retry_count = 1`. This is the
 *   critical scenario : terminal failure rows are what motivate prompt tuning, losing them would
 *   empty the observability signal.
 * - **Recorder is always invoked exactly once per run** — even when the executor throws. The
 *   `try/finally` discipline is the contract.
 *
 * Note : we don't assert on the per-phase [JobEventPublisher] events here ; that wire format is
 * covered by `JobEventPublisherTest`. The executor test focuses strictly on score-tracking.
 */
class TickerNarrativeExecutorTest {

  private val tickerService: TickerService = mock()
  private val llmClient: LlmClient = mock()
  private val parser: TickerNarrativeParser = mock()
  private val validator: TickerNarrativeValidator = mock()
  private val persister: TickerNarrativePersister = mock()
  private val publisher: JobEventPublisher = mock()
  private val promptService: TickerNarrativePromptService = mock()
  private val scoreRecorder: PromptScoreRecorder = mock()

  private val executor =
    TickerNarrativeExecutor(
      tickerService,
      llmClient,
      parser,
      validator,
      persister,
      publisher,
      promptService,
      scoreRecorder,
    )

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `success on first attempt records retry_count=0 with no failure flags`() {
    val prompt = activePrompt()
    val snapshot = persistedSnapshot()
    primeHappyPath(prompt, snapshot)
    given(parser.parse(any())).willReturn(parsedNarrative())
    given(validator.validate(any())).willReturn(NarrativeValidationResult.Valid)

    val returned = executor.execute("AAPL", UUID.randomUUID())

    assertEquals(snapshot.id, returned.id)
    verify(scoreRecorder)
      .record(
        promptTemplate = eq(prompt),
        snapshotId = eq(snapshot.id),
        latencyMs = any(),
        retryCount = eq(0),
        parseFailed = eq(false),
        validatorFailed = eq(false),
      )
  }

  // ---------------------------------------------------------------------- parser failure

  @Test
  fun `parser failure on attempt 1 then success records retry_count=1 with parse_failed=true`() {
    val prompt = activePrompt()
    val snapshot = persistedSnapshot()
    primeHappyPath(prompt, snapshot)
    // First parse attempt blows up (local model padded prose around the JSON for example),
    // second attempt succeeds after the re-prompt feedback.
    given(parser.parse(any()))
      .willThrow(IllegalArgumentException("not JSON"))
      .willReturn(parsedNarrative())
    given(validator.validate(any())).willReturn(NarrativeValidationResult.Valid)

    val returned = executor.execute("AAPL", UUID.randomUUID())

    assertEquals(snapshot.id, returned.id)
    verify(scoreRecorder)
      .record(
        promptTemplate = eq(prompt),
        snapshotId = eq(snapshot.id),
        latencyMs = any(),
        retryCount = eq(1),
        parseFailed = eq(true),
        validatorFailed = eq(false),
      )
  }

  // ---------------------------------------------------------------------- validator failure
  // recovered

  @Test
  fun `validator Invalid on attempt 1 then Valid records retry_count=1 with validator_failed=true`() {
    val prompt = activePrompt()
    val snapshot = persistedSnapshot()
    primeHappyPath(prompt, snapshot)
    given(parser.parse(any())).willReturn(parsedNarrative())
    // Validator fails the first parse, accepts the second (after the re-prompt feedback nudged
    // the LLM to fix the bad sentiment / key points / etc.).
    given(validator.validate(any()))
      .willReturn(NarrativeValidationResult.Invalid(listOf("too few keyPoints")))
      .willReturn(NarrativeValidationResult.Valid)

    val returned = executor.execute("AAPL", UUID.randomUUID())

    assertEquals(snapshot.id, returned.id)
    verify(scoreRecorder)
      .record(
        promptTemplate = eq(prompt),
        snapshotId = eq(snapshot.id),
        latencyMs = any(),
        retryCount = eq(1),
        parseFailed = eq(false),
        validatorFailed = eq(true),
      )
  }

  // ---------------------------------------------------------------------- terminal failure

  @Test
  fun `both attempts failing throws but still records the score with snapshot_id=null`() {
    val prompt = activePrompt()
    given(promptService.activePrompt()).willReturn(prompt)
    given(tickerService.load("AAPL")).willReturn(marketSnapshot())
    given(llmClient.complete(any(), any(), any())).willReturn("not json again")
    given(llmClient.modelId()).willReturn("claude:test")
    given(parser.parse(any())).willReturn(parsedNarrative())
    // Validator rejects both attempts — terminal failure path.
    given(validator.validate(any()))
      .willReturn(NarrativeValidationResult.Invalid(listOf("too few keyPoints")))
      .willReturn(NarrativeValidationResult.Invalid(listOf("still too few keyPoints")))

    assertThrows<IllegalStateException> { executor.execute("AAPL", UUID.randomUUID()) }

    // Critical : the `finally` must fire on the throw path too, so PR6's stats page still sees
    // the failure runs that motivate prompt tuning. snapshot_id stays null (no persistence
    // happened), retry_count = 1 (we did re-prompt once before giving up).
    verify(scoreRecorder)
      .record(
        promptTemplate = eq(prompt),
        snapshotId = isNull(),
        latencyMs = any(),
        retryCount = eq(1),
        parseFailed = eq(false),
        validatorFailed = eq(true),
      )
  }

  // ---------------------------------------------------------------------- latency sanity

  @Test
  fun `latency_ms is non-negative on the success path`() {
    // We can't pin an exact latency (machine speed varies) but we can pin that it's not negative
    // — that's the only realistic regression mode (e.g. someone swaps `currentTimeMillis()` for
    // a monotonic-but-uninitialised counter).
    val prompt = activePrompt()
    val snapshot = persistedSnapshot()
    primeHappyPath(prompt, snapshot)
    given(parser.parse(any())).willReturn(parsedNarrative())
    given(validator.validate(any())).willReturn(NarrativeValidationResult.Valid)
    val captor = argumentCaptor<Int>()

    executor.execute("AAPL", UUID.randomUUID())

    verify(scoreRecorder)
      .record(
        promptTemplate = any(),
        snapshotId = any(),
        latencyMs = captor.capture(),
        retryCount = any(),
        parseFailed = any(),
        validatorFailed = any(),
      )
    assert(captor.firstValue >= 0) { "latency_ms must be non-negative, got ${captor.firstValue}" }
  }

  // ---------------------------------------------------------------------- helpers

  private fun primeHappyPath(prompt: PromptTemplate, snapshot: TickerNarrativeSnapshot) {
    given(promptService.activePrompt()).willReturn(prompt)
    given(tickerService.load("AAPL")).willReturn(marketSnapshot())
    given(llmClient.complete(any(), any(), any())).willReturn("""{"summary":"ok"}""")
    given(llmClient.modelId()).willReturn("claude:test")
    given(persister.persist(eq("AAPL"), any(), any(), any(), eq(prompt))).willReturn(snapshot)
  }

  private fun activePrompt(): PromptTemplate =
    PromptTemplate(
      id = UUID.randomUUID(),
      name = "narrative-default",
      version = "v2",
      systemPrompt = "Body",
      isActive = true,
    )

  private fun marketSnapshot(): TickerSnapshot {
    val asOf = Instant.parse("2026-05-11T12:00:00Z")
    return TickerSnapshot(
      quote =
        TickerQuote(
          symbol = "AAPL",
          name = "Apple Inc.",
          currency = "USD",
          exchange = "NASDAQ",
          price = BigDecimal("180.00"),
          fiftyTwoWeekHigh = BigDecimal("200.00"),
          fiftyTwoWeekLow = BigDecimal("140.00"),
          asOf = asOf,
          instrumentType = null,
        ),
      indicators =
        Indicators(
          asOf = asOf,
          price = BigDecimal("180.00"),
          rsi14 = BigDecimal("60"),
          ma50 = BigDecimal("178"),
          ma200 = BigDecimal("170"),
          momentum30d = BigDecimal("3"),
          momentum90d = BigDecimal("8"),
          perf1m = BigDecimal("2"),
          perf3m = BigDecimal("9"),
          perf1y = BigDecimal("18"),
          drawdownFrom52wHigh = BigDecimal("-10"),
          volumeRelative30d = BigDecimal("1.2"),
          distanceToMa50Pct = BigDecimal("1.1"),
          distanceToMa200Pct = BigDecimal("5.9"),
        ),
      bars = emptyList<OhlcBar>(),
    )
  }

  private fun parsedNarrative(): ParsedNarrative =
    ParsedNarrative(
      summary = "Price above MA200. RSI neutral. Momentum positive.",
      sentiment = Sentiment.BULLISH,
      keyPoints = listOf("RSI 60 in neutral band", "Above MA200", "Positive 90d momentum"),
    )

  private fun persistedSnapshot(): TickerNarrativeSnapshot =
    TickerNarrativeSnapshot(
      id = UUID.fromString("11111111-2222-3333-4444-555555555555"),
      symbol = "AAPL",
      price = BigDecimal("180.00"),
      indicatorsJson = "{}",
      summary = "Price above MA200. RSI neutral. Momentum positive.",
      sentiment = Sentiment.BULLISH,
      keyPointsJson = "[]",
      modelUsed = "claude:test",
      promptVersion = "v2",
      promptTemplateId = UUID.randomUUID(),
    )
}
