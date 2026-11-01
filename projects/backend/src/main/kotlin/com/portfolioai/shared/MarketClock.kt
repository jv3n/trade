package com.portfolioai.shared

import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

/** Where the trading day is defined. */
val NEW_YORK: ZoneId = ZoneId.of("America/New_York")

/** The trading day : New York's date, whatever zone the server or the user is in. */
fun Clock.marketToday(): LocalDate = LocalDate.now(withZone(NEW_YORK))
