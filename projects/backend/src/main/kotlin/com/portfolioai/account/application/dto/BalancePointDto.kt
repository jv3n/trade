package com.portfolioai.account.application.dto

import java.math.BigDecimal
import java.time.LocalDate

/**
 * One point of the cumulative balance series : the end-of-day balance on [date] (running sum of
 * every movement up to and including that day). The series carries one point per distinct movement
 * date, ascending. Period windowing + the period-change KPI are computed client-side from the full
 * series — keeps this endpoint a pure, date-independent function of the data.
 */
data class BalancePointDto(val date: LocalDate, val balance: BigDecimal)
