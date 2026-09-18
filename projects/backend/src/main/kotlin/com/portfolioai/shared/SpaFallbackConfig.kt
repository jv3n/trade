package com.portfolioai.shared

import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.core.io.Resource
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import org.springframework.web.servlet.resource.PathResourceResolver

/**
 * Configure le fallback Spring MVC pour la SPA Angular embarquée en prod Cloud Run.
 *
 * Note Kotlin : cette KDoc évite volontairement les patterns Spring du type slash-double-star
 * (rendus en prose, e.g. "le namespace api" au lieu du literal) parce que Kotlin supporte les
 * nested block comments, et la séquence slash-star à l'intérieur d'un commentaire ouvre un
 * commentaire imbriqué qui doit lui-même être fermé. Une KDoc citant ce genre de pattern Spring en
 * clair triggère un "Unclosed comment" au compileKotlin.
 *
 * Le Dockerfile multi-stage (cf. devops/prod/Dockerfile, Stage 1 Node 24 frontend → Stage 2 Temurin
 * 21 JDK backend + COPY de l'output Angular vers le dossier src/main/resources/static → Stage 3 JRE
 * runtime) embarque la SPA dans le jar Spring Boot. Angular Router gère ses routes côté client via
 * pushState : cliquer "Settings" dans la nav fait passer l'URL au path settings-configuration sans
 * qu'aucun GET ne soit envoyé au serveur.
 *
 * Mais un refresh ou un collage d'URL directe envoie un vrai GET au backend, qui n'a aucun
 * controller pour ces routes Angular (les controllers vivent tous sous le namespace api). Sans
 * fallback, Spring retourne 404.
 *
 * Cette config câble un resource handler générique (pattern double-star) qui :
 * - cède la priorité aux controllers Spring (RequestMappingHandlerMapping consulté avant)
 * - sert directement les fichiers statiques qui existent (e.g. main.abc.js, assets/logo.png,
 *   i18n/fr.json, favicon.ico)
 * - laisse passer les paths réservés au backend (api, actuator, oauth2, etc.) pour ne pas masquer
 *   un vrai 404 d'endpoint manquant par un faux 200 d'index.html
 * - pour tout le reste (routes Angular client-side), forward vers index.html — Angular Router prend
 *   ensuite le relais côté browser pour rendre la bonne vue
 *
 * Actif uniquement en profile prod parce qu'en dev (tilt up) la SPA tourne sur Angular CLI port
 * 4201 avec son propre SPA fallback ; le static du backend Spring est vide, et activer cette config
 * ferait juste 404 silencieux. L'annotation @Profile("prod") rend l'intention explicite.
 *
 * Pendant la setup Cloud Run il faut aussi que SecurityConfig permitAll les routes Angular — cf. la
 * règle anyRequest permitAll posée en parallèle de cette config (les routes sensibles restent gated
 * par authenticated() sur le namespace api + hasRole sur les paths admin).
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
      // Si le path commence par un namespace réservé au backend, on rend la main à Spring
      // (controllers, actuator, OAuth flow). Sinon le resolver risquerait de masquer un 404
      // d'API manquante par un faux 200 + index.html, ce qui pourrait casser l'auth.interceptor
      // frontend qui détecte les 401 sur `/api/me`.
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
