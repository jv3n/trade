package com.portfolioai.auth.application

import java.util.UUID

/**
 * Published when an SSO login creates a brand-new `app_user` row — never on a returning login.
 * Consumed synchronously, in the login transaction, by whatever has to give a fresh account its
 * starting state (locally, `LocalDataSeeder`).
 *
 * Carries the id alone : the email is PII and has no business travelling on an event bus.
 */
data class UserCreatedEvent(val userId: UUID)
