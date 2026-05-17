package com.portfolioai.auth.application.dto

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User

/**
 * Minimal shape exposed by `GET /api/me` — what the SPA needs to render the navbar (display name)
 * and gate admin-only routes (role). Deliberately omits internal fields like provider id, created
 * at, last login at : they have no UI use today and would just enlarge the response.
 */
data class CurrentUserDto(val email: String, val displayName: String?, val role: Role)

fun User.toCurrentUserDto(): CurrentUserDto =
  CurrentUserDto(email = email, displayName = displayName, role = role)
