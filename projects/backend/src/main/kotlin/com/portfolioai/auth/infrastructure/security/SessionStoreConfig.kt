package com.portfolioai.auth.infrastructure.security

import org.slf4j.LoggerFactory
import org.springframework.context.ApplicationContext
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.convert.converter.Converter
import org.springframework.core.convert.support.GenericConversionService
import org.springframework.core.serializer.support.DeserializingConverter
import org.springframework.core.serializer.support.SerializationFailedException
import org.springframework.core.serializer.support.SerializingConverter
import org.springframework.session.config.SessionRepositoryCustomizer
import org.springframework.session.jdbc.JdbcIndexedSessionRepository

/**
 * The session store (#460) : Spring Session JDBC, on the application's Postgres.
 *
 * Attributes are written with Java serialisation, so a session written by one release is read by
 * the next. When a class inside it changed incompatibly — Spring Security bumps its
 * `serialVersionUID` on every minor version — the default converter throws on every request of that
 * session, a 500 until the row expires. Here an unreadable attribute reads as absent instead : the
 * `SecurityContext` is gone, `/api/me` answers 401, and the user signs in again.
 */
@Configuration
class SessionStoreConfig {

  @Bean
  fun lenientSessionAttributes(
    context: ApplicationContext
  ): SessionRepositoryCustomizer<JdbcIndexedSessionRepository> {
    // The context's class loader, not this class's : under devtools the application classes live in
    // the restart class loader, and a principal deserialised elsewhere would not cast.
    val classLoader = context.classLoader
    return SessionRepositoryCustomizer { repository ->
      repository.setConversionService(
        GenericConversionService().apply {
          addConverter(Any::class.java, ByteArray::class.java, SerializingConverter())
          addConverter(
            ByteArray::class.java,
            Any::class.java,
            LenientDeserializer(DeserializingConverter(classLoader)),
          )
        }
      )
    }
  }
}

/** Deserialises a session attribute, or drops it when its bytes no longer match the classes. */
internal class LenientDeserializer(private val delegate: DeserializingConverter) :
  Converter<ByteArray, Any> {

  private val log = LoggerFactory.getLogger(javaClass)

  override fun convert(source: ByteArray): Any? =
    try {
      delegate.convert(source)
    } catch (e: SerializationFailedException) {
      log.warn("Dropping an unreadable session attribute : {}", e.mostSpecificCause.toString())
      null
    }
}
