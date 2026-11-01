package com.portfolioai.auth.application

import com.portfolioai.config.application.parseEmailList
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/**
 * Refuses to boot a deployed environment without an admin : the login gate fails closed (#840), and
 * the whitelist is edited from a page that needs a login, so an empty `APP_ADMIN_EMAILS` would
 * start healthy and refuse everyone. A failed boot keeps the previous revision serving.
 */
@Profile("prod")
@Component
class AdminEmailsCheck(@Value("\${app.admin.emails:}") adminEmails: String) {
  init {
    check(parseEmailList(adminEmails).isNotEmpty()) {
      "APP_ADMIN_EMAILS is empty : nobody could log in to this environment"
    }
  }
}
