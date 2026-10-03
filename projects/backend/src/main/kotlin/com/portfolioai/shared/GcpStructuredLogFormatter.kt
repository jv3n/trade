package com.portfolioai.shared

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.classic.spi.ThrowableProxyUtil
import org.springframework.boot.logging.structured.StructuredLogFormatter
import org.springframework.core.env.Environment
import tools.jackson.databind.json.JsonMapper

/**
 * One JSON line per log event, in the shape Cloud Logging reads off stdout : a `severity` it can
 * filter on, and the request's trace so the line folds under its request log. Spring Boot ships no
 * Google Cloud format — ECS writes `log.level`, which Cloud Logging ignores.
 */
class GcpStructuredLogFormatter(environment: Environment) : StructuredLogFormatter<ILoggingEvent> {

  private val tracePrefix =
    "projects/${environment.getRequiredProperty(PROJECT_ID_PROPERTY)}/traces/"

  override fun format(event: ILoggingEvent): String {
    val mdc = event.mdcPropertyMap
    val entry =
      buildMap<String, String?> {
        put("severity", severityOf(event.level))
        put("message", event.formattedMessage)
        put("time", event.instant.toString())
        put("logger", event.loggerName)
        put("thread", event.threadName)
        mdc[CloudTraceFilter.TRACE_ID_KEY]?.let { put(TRACE_FIELD, tracePrefix + it) }
        mdc.forEach { (key, value) ->
          if (key != CloudTraceFilter.TRACE_ID_KEY) putIfAbsent(key, value)
        }
        // The key Cloud Error Reporting picks up, should it ever be wanted next to GlitchTip.
        event.throwableProxy?.let { put("stack_trace", ThrowableProxyUtil.asString(it)) }
      }
    return JSON.writeValueAsString(entry) + "\n"
  }

  private fun severityOf(level: Level) =
    when (level) {
      Level.ERROR -> "ERROR"
      Level.WARN -> "WARNING"
      Level.INFO -> "INFO"
      Level.DEBUG,
      Level.TRACE -> "DEBUG"
      else -> "DEFAULT"
    }

  companion object {
    const val PROJECT_ID_PROPERTY = "app.logging.gcp-project-id"
    const val TRACE_FIELD = "logging.googleapis.com/trace"
    private val JSON = JsonMapper.shared()
  }
}
