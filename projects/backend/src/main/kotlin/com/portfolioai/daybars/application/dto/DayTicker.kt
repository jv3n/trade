package com.portfolioai.daybars.application.dto

import java.time.LocalDate

/** A ticker-day whose bars the scanner is asked for (#798). */
data class DayTicker(val tradingDate: LocalDate, val ticker: String)
