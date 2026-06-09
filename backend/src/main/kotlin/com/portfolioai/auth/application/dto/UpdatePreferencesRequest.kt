package com.portfolioai.auth.application.dto

/**
 * Partial update of the current user's UI preferences (`PUT /api/me/preferences`). Both fields are
 * optional : the SPA sends only the one that changed (theme toggle OR language toggle). A `null`
 * field is left untouched. Allowed values are validated in `AuthService.updatePreferences` (400 on
 * an unknown value).
 */
data class UpdatePreferencesRequest(val theme: String? = null, val language: String? = null)
