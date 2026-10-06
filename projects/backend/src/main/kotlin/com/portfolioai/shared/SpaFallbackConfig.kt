package com.portfolioai.shared

import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.core.io.Resource
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import org.springframework.web.servlet.resource.PathResourceResolver

/**
 * Serves the Angular SPA embedded in the prod jar : an existing static file is returned as-is, and
 * a client-side route falls back to index.html so a refresh on it doesn't 404. A missing **file**
 * is a 404 (#644) : a chunk a deploy removed must not come back as HTML, which the edge caches for
 * a year under the chunk's name. Paths reserved by the backend are handed back to Spring, or a
 * missing endpoint would answer 200 with index.html instead of 404.
 *
 * Prod-only : in dev the SPA is served by the Angular CLI with its own fallback, and the backend's
 * static directory is empty.
 *
 * This KDoc spells the Spring path patterns out in prose on purpose — Kotlin nests block comments,
 * so writing one literally opens a nested comment and the file stops compiling.
 */
@Configuration
@Profile("prod")
class SpaFallbackConfig : WebMvcConfigurer {

  override fun addResourceHandlers(registry: ResourceHandlerRegistry) {
    registry
      .addResourceHandler("/**")
      .addResourceLocations("classpath:/static/")
      .resourceChain(true)
      .addResolver(SpaPathResourceResolver())
  }

  private class SpaPathResourceResolver : PathResourceResolver() {
    override fun getResource(resourcePath: String, location: Resource): Resource? =
      spaResource(resourcePath, location)
  }
}

private val BACKEND_NAMESPACES =
  listOf("api/", "actuator/", "oauth2/", "login/oauth2/", "swagger-ui/", "v3/api-docs/")

/**
 * What the SPA serves for [resourcePath] under [location] — null hands the request back to Spring,
 * which answers 404. The client's routes carry no file extension ; anything that does is a file.
 */
internal fun spaResource(resourcePath: String, location: Resource): Resource? {
  // Masking a missing endpoint with a 200 + index.html would break the frontend interceptor, which
  // reads the 401 on `/api/me`.
  if (BACKEND_NAMESPACES.any { resourcePath.startsWith(it) }) return null

  val requested = location.createRelative(resourcePath)
  return when {
    requested.exists() && requested.isReadable -> requested
    resourcePath.substringAfterLast('/').contains('.') -> null
    else -> location.createRelative("index.html")
  }
}
