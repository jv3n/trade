package com.portfolioai.auth.infrastructure.http

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.application.dto.CurrentUserDto
import com.portfolioai.auth.application.dto.UpdatePreferencesRequest
import com.portfolioai.auth.application.dto.toCurrentUserDto
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Auth-side REST surface. Only `GET /api/me` lives here in v1 — returns the authenticated user for
 * the SPA's navbar + role-based route gating.
 *
 * **Logout** uses Spring Security's built-in `POST /logout` handler (configured in
 * [com.portfolioai.auth.infrastructure.security.SecurityConfig]) — no custom endpoint needed.
 *
 * **401 surfacing** : when no session is attached, Spring Security's `HttpStatusEntryPoint` returns
 * 401 before this controller runs. The SPA's HTTP interceptor uses that as the trigger to redirect
 * to `/login`.
 */
@Tag(name = "Auth", description = "Current user introspection")
@RestController
@RequestMapping("/api")
class AuthController(private val authService: AuthService) {

  @GetMapping("/me") fun me(): CurrentUserDto = authService.getCurrentUser().toCurrentUserDto()

  /**
   * Updates the current user's UI preferences (theme / language) and returns the refreshed user.
   * Partial — only the provided fields change (cf. [UpdatePreferencesRequest]). Authenticated, not
   * ADMIN-gated : a user manages their own preferences.
   */
  @PutMapping("/me/preferences")
  fun updatePreferences(@RequestBody request: UpdatePreferencesRequest): CurrentUserDto =
    authService.updatePreferences(request.theme, request.language).toCurrentUserDto()
}
