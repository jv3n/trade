package com.portfolioai.config.application

/**
 * Registry of runtime-editable config keys. Adding a new key happens in three places :
 * 1. Add the constant here (and to [KNOWN_KEYS]).
 * 2. Inject the YAML default into [AppConfigService] (`@Value(...)` constructor parameter).
 * 3. Wire its consumer to read via [AppConfigService] instead of `@Value` (so live changes apply).
 *
 * Keep the list short — only what's worth editing without a reboot. Stuff that's stable across the
 * lifetime of the app (db url, port…) belongs in YAML, not here.
 */
object ConfigKeys {
  /**
   * Comma-separated whitelist of emails authorised to complete the OAuth login. Empty value = open
   * mode (anyone with a Google account is let in — backward-compat for fresh deploys before the
   * admin posts the first list). Non-empty = gated mode : the effective whitelist is the union of
   * this list and `app.admin.emails` (admins are auto-included so the operator can't lock
   * themselves out by removing their own email from the UI).
   */
  const val ALLOWED_EMAILS = "app.allowed.emails"

  val EMAIL_LIST_KEYS: Set<String> = setOf(ALLOWED_EMAILS)

  val KNOWN_KEYS: Set<String> = setOf(ALLOWED_EMAILS)
}
