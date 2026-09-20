package com.portfolioai.shared

import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.core.io.Resource
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import org.springframework.web.servlet.resource.PathResourceResolver

/**
 * Serves the Angular SPA embedded in the prod jar : an existing static file is returned as-is,
 * anything else falls back to index.html so a refresh on a client-side route doesn't 404. Paths
 * reserved by the backend are handed back to Spring, or a missing endpoint would answer 200 with
 * index.html instead of 404.
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
    override fun getResource(resourcePath: String, location: Resource): Resource? {
      // Hand the backend's own namespaces back to Spring : masking a missing endpoint with a 200 +
      // index.html would break the frontend interceptor, which reads the 401 on `/api/me`.
      if (BACKEND_NAMESPACES.any { resourcePath.startsWith(it) }) {
        return null
      }

      val requested = location.createRelative(resourcePath)
      return when {
        requested.exists() && requested.isReadable -> requested
        else -> location.createRelative("index.html")
      }
    }

    private companion object {
      val BACKEND_NAMESPACES =
        listOf("api/", "actuator/", "oauth2/", "login/oauth2/", "swagger-ui/", "v3/api-docs/")
    }
  }
}
