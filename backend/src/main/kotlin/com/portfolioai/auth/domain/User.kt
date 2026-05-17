package com.portfolioai.auth.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * One authenticated user. Maps 1:1 to `app_user` (V9).
 *
 * Created lazily on the OAuth2 callback : the first time a Google identity successfully completes
 * the redirect dance, `CustomOAuth2UserService` inserts the row with [role] computed from the
 * `app.admin.emails` whitelist (matching email → [Role.ADMIN], otherwise [Role.USER]). On
 * subsequent logins the row is updated in place ([lastLoginAt] refreshed, [displayName] re-sync'd
 * if Google returns a different name). The role itself is **not** re-evaluated on subsequent logins
 * so that a manual rétrogradation (`UPDATE app_user SET role='USER'`) survives the next login of an
 * email that's still in the whitelist — the table is the source of truth, the whitelist only seeds
 * the first creation.
 *
 * Email is the natural key (UNIQUE constraint) so a future second provider (GitHub OAuth) doesn't
 * fork a user per provider for the same human ; [provider] and [providerId] stay as traceability
 * only.
 *
 * Table named `app_user` (not `user`) because `user` is a reserved PostgreSQL keyword — quoting it
 * everywhere is friction for no gain.
 */
@Entity
@Table(name = "app_user")
class User(
  @Id val id: UUID = UUID.randomUUID(),
  @Column(nullable = false, length = 255, unique = true) var email: String,
  @Column(name = "display_name", length = 255) var displayName: String? = null,
  @Column(nullable = false, length = 50) val provider: String,
  @Column(name = "provider_id", length = 255) var providerId: String? = null,
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) var role: Role,
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "last_login_at") var lastLoginAt: Instant? = null,
)
