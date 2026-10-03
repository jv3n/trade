package com.portfolioai.shared

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.classic.spi.LoggingEvent
import ch.qos.logback.classic.spi.ThrowableProxy
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/**
 * Pins the log line Cloud Logging reads off the production stdout (#555). Without these fields the
 * Logs Explorer sees plain text : every line at DEFAULT severity, none tied to its request.
 *
 * - **`severity` speaks Cloud Logging's names** — `WARN` is `WARNING` there, and `TRACE` has none.
 * - **The trace field folds the line under its request log** — only on a request, never empty.
 * - **The MDC is flattened** so `userId` is a field to filter on, not a fragment of the message.
 * - **An exception keeps its stack trace**, and the output stays one line.
 */
class GcpStructuredLogFormatterTest {

  private val formatter =
    GcpStructuredLogFormatter(
      MockEnvironment().withProperty(GcpStructuredLogFormatter.PROJECT_ID_PROPERTY, "trade-496613")
    )

  @Test
  fun `writes the level under Cloud Logging's severity names`() {
    val severities =
      listOf(Level.ERROR, Level.WARN, Level.INFO, Level.DEBUG, Level.TRACE).map {
        format(event(level = it))["severity"].asString()
      }

    assertEquals(listOf("ERROR", "WARNING", "INFO", "DEBUG", "DEBUG"), severities)
  }

  @Test
  fun `writes the message, the logger and the timestamp`() {
    val line = format(event())

    assertEquals("Stat KTTA completed", line["message"].asString())
    assertEquals("com.portfolioai.stats.application.StatEntryService", line["logger"].asString())
    assertEquals("2026-10-03T14:31:07Z", line["time"].asString())
  }

  @Test
  fun `points a request's line at its trace and keeps the trace id out of the fields`() {
    val line = format(event(mdc = mapOf(CloudTraceFilter.TRACE_ID_KEY to TRACE_ID)))

    assertEquals(
      "projects/trade-496613/traces/$TRACE_ID",
      line[GcpStructuredLogFormatter.TRACE_FIELD].asString(),
    )
    assertFalse(line.has(CloudTraceFilter.TRACE_ID_KEY))
  }

  @Test
  fun `leaves the trace field out of a line logged outside a request`() {
    assertFalse(format(event()).has(GcpStructuredLogFormatter.TRACE_FIELD))
  }

  @Test
  fun `flattens the MDC into fields of their own`() {
    val userId = "5b0e6f1c-2a7d-4c43-9a51-0d3f8e2b7c19"

    val line = format(event(mdc = mapOf("userId" to userId)))

    assertEquals(userId, line["userId"].asString())
  }

  @Test
  fun `an MDC entry never overwrites a field of the line itself`() {
    val line = format(event(mdc = mapOf("severity" to "DEBUG")))

    assertEquals("INFO", line["severity"].asString())
  }

  @Test
  fun `keeps the stack trace of an exception, on a single line`() {
    val raw =
      formatter.format(
        event(level = Level.ERROR, error = IllegalStateException("Stat KTTA has no open price"))
      )

    val stackTrace = JSON.readTree(raw)["stack_trace"].asString()
    assertTrue(
      stackTrace.startsWith("java.lang.IllegalStateException: Stat KTTA has no open price")
    )
    assertTrue("\tat " in stackTrace)
    assertEquals(1, raw.trimEnd('\n').lines().size)
    assertTrue(raw.endsWith("\n"))
  }

  private fun format(event: ILoggingEvent): JsonNode = JSON.readTree(formatter.format(event))

  private fun event(
    level: Level = Level.INFO,
    mdc: Map<String, String> = emptyMap(),
    error: Throwable? = null,
  ): ILoggingEvent =
    LoggingEvent().apply {
      setLevel(level)
      setMessage("Stat KTTA completed")
      setLoggerName("com.portfolioai.stats.application.StatEntryService")
      setThreadName("http-nio-8080-exec-3")
      setInstant(Instant.parse("2026-10-03T14:31:07Z"))
      setMDCPropertyMap(mdc)
      error?.let { setThrowableProxy(ThrowableProxy(it)) }
    }

  private companion object {
    const val TRACE_ID = "105445aa7843bc8bf206b12000100000"
    val JSON: JsonMapper = JsonMapper.shared()
  }
}
