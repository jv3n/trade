package com.portfolioai.stats.application.dto

import com.portfolioai.shared.Pattern
import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

/**
 * A stat as ts-scanner read it on the previous session's bars (#763) — what a chart gives, no
 * float, note nor flag but « no push ». A GUS carries its premarket and its OPS session, a DT its
 * five BARES points ; the other pattern's fields are ignored, as on a typed stat.
 */
data class ScannedStat(
  val pattern: Pattern,
  val ticker: String,
  val volumeMillions: BigDecimal? = null,
  // ---- GUS ----
  val previousClose: BigDecimal? = null,
  val pmOpen: BigDecimal? = null,
  val pmHigh: BigDecimal? = null,
  val openPrice: BigDecimal? = null,
  val pushOpenPrice: BigDecimal? = null,
  val pushOpenTime: LocalTime? = null,
  val noPush: Boolean = false,
  val hodPrice: BigDecimal? = null,
  val lodPrice: BigDecimal? = null,
  val eodPrice: BigDecimal? = null,
  val gusDropPrice: BigDecimal? = null,
  val gusDropTime: LocalTime? = null,
  // ---- DT ----
  val dtStartPrice: BigDecimal? = null,
  val dtStartTime: LocalTime? = null,
  val dtTopPrice: BigDecimal? = null,
  val dtTopTime: LocalTime? = null,
  val dtLowPrice: BigDecimal? = null,
  val dtLowTime: LocalTime? = null,
  val dtRetestPrice: BigDecimal? = null,
  val dtRetestTime: LocalTime? = null,
  val dtDropPrice: BigDecimal? = null,
  val dtDropTime: LocalTime? = null,
) {
  fun toRequest(tradeDate: LocalDate) =
    StatEntryRequest(
      tradeDate = tradeDate,
      pattern = pattern,
      ticker = ticker,
      previousClose = previousClose,
      pmOpen = pmOpen,
      pmHigh = pmHigh,
      volumeMillions = volumeMillions,
      openPrice = openPrice,
      pushOpenPrice = pushOpenPrice,
      hodPrice = hodPrice,
      lodPrice = lodPrice,
      eodPrice = eodPrice,
      pushOpenTime = pushOpenTime,
      gusDropPrice = gusDropPrice,
      gusDropTime = gusDropTime,
      dtStartPrice = dtStartPrice,
      dtTopPrice = dtTopPrice,
      dtLowPrice = dtLowPrice,
      dtRetestPrice = dtRetestPrice,
      dtStartTime = dtStartTime,
      dtTopTime = dtTopTime,
      dtLowTime = dtLowTime,
      dtRetestTime = dtRetestTime,
      dtDropPrice = dtDropPrice,
      dtDropTime = dtDropTime,
      noPush = noPush,
    )
}

/** Why a scanned stat was not created (#763). */
enum class ScanSkipReason {
  /** The day, ticker and pattern are already in the sheet, typed or promoted from a candidate. */
  TYPED_BY_HAND,
  /** Already dropped by an earlier run — to review or validated. */
  ALREADY_SCANNED,
  /** Rejected on review : a re-scan never brings it back. */
  REJECTED,
  /** The same ticker and pattern twice in one batch — the first one is kept. */
  DUPLICATE_IN_BATCH,
  /** Refused by the stat's own rules — [ScannedStatSkipped.detail] says which. */
  INVALID,
}

data class ScannedStatCreated(val id: UUID, val ticker: String, val pattern: Pattern)

data class ScannedStatSkipped(
  val ticker: String,
  val pattern: Pattern,
  val reason: ScanSkipReason,
  val detail: String? = null,
)

/** What a push of the scanner gave : pushing the same batch again creates nothing. */
data class ScannedStatsResult(
  val created: List<ScannedStatCreated>,
  val skipped: List<ScannedStatSkipped>,
)
