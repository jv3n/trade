package com.portfolioai.stats.application

import com.portfolioai.auth.domain.User
import com.portfolioai.shared.Pattern
import com.portfolioai.shared.badRequest
import com.portfolioai.shared.requireNonNegative
import com.portfolioai.shared.requirePositive
import com.portfolioai.stats.application.dto.StatEntryRequest
import com.portfolioai.stats.domain.Premarket
import com.portfolioai.stats.domain.StatEntry
import java.math.BigDecimal
import java.time.LocalTime
import java.time.temporal.ChronoUnit
import java.util.UUID

// The write rules of a stat, shared by [StatEntryService]'s create, update and tick.

/** TradeZero's extended session — the bounds of a double top's times (#469). */
private val SESSION_OPENS: LocalTime = LocalTime.of(4, 0)
private val SESSION_CLOSES: LocalTime = LocalTime.of(20, 0)

/**
 * The patterns a stat measures (#648) — the only two traded and measured. A trade keeps the whole
 * [Pattern] list : a SIR, SIV or discretionary trade is typed in the journal, with no stat.
 */
internal val STAT_PATTERNS: List<Pattern> = listOf(Pattern.GUS, Pattern.DT)

/** A blank shell — [apply] does the validation and fills every field right after. */
internal fun newEntry(user: User, request: StatEntryRequest, ticker: String, candidateId: UUID?) =
  StatEntry(
    user = user,
    candidateId = candidateId,
    tradeDate = request.tradeDate,
    ticker = ticker,
  )

/**
 * Validates [request] and copies it onto this stat (ticker already cleaned). A double top keeps its
 * four prices and drops the premarket prices (#649), the GUS session and « no push » ; any other
 * pattern the reverse.
 */
internal fun StatEntry.fillFrom(request: StatEntryRequest, cleanTicker: String) {
  if (request.pattern !in STAT_PATTERNS) {
    throw badRequest("A stat is a GUS or a DT, not ${request.pattern}")
  }
  val doubleTop = request.pattern == Pattern.DT
  val gus = !doubleTop
  val previousClose = if (gus) request.previousClose.required("Previous close") else null
  val pmOpen = if (gus) request.pmOpen.required("PM open") else null
  val pmHigh = if (gus) request.pmHigh.required("PM high") else null
  if (pmHigh != null && pmOpen != null && pmHigh < pmOpen) {
    throw badRequest("PM high must not be below the PM open")
  }
  val hod = request.hodPrice?.takeIf { gus }?.requirePositive("HOD")
  val lod = request.lodPrice?.takeIf { gus }?.requirePositive("LOD")
  val open = request.openPrice?.takeIf { gus }?.requirePositive("Open")
  val noPush = gus && request.noPush
  val push =
    if (noPush) null else request.pushOpenPrice?.takeIf { gus }?.requirePositive("Push at open")
  val eod = request.eodPrice?.takeIf { gus }?.requirePositive("EOD")
  requireInsideTheDay(hod, lod, listOf("Open" to open, "Push at open" to push, "EOD" to eod))
  val dtStart = request.dtStartPrice?.takeIf { doubleTop }?.requirePositive("Start")
  val dtTop = request.dtTopPrice?.takeIf { doubleTop }?.requirePositive("Top")
  val dtLow = request.dtLowPrice?.takeIf { doubleTop }?.requirePositive("Rejection low")
  val dtRetest = request.dtRetestPrice?.takeIf { doubleTop }?.requirePositive("Retest")
  requireDoubleTopShape(dtStart, dtTop, dtLow, dtRetest)
  val dtStartTime = request.dtStartTime?.takeIf { doubleTop }?.inSession("Start time")
  val dtTopTime = request.dtTopTime?.takeIf { doubleTop }?.inSession("Top time")
  val dtLowTime = request.dtLowTime?.takeIf { doubleTop }?.inSession("Rejection low time")
  val dtRetestTime = request.dtRetestTime?.takeIf { doubleTop }?.inSession("Retest time")
  requireDoubleTopTimesInOrder(dtStartTime, dtTopTime, dtLowTime, dtRetestTime)

  tradeDate = request.tradeDate
  pattern = request.pattern
  ticker = cleanTicker
  this.previousClose = previousClose
  this.pmOpen = pmOpen
  this.pmHigh = pmHigh
  floatMillions = request.floatMillions?.requireNonNegative("Float")
  volumeMillions = request.volumeMillions?.requireNonNegative("Volume")
  note = request.note?.trim()?.ifEmpty { null }

  openPrice = open
  pushOpenPrice = push
  hodPrice = hod
  lodPrice = lod
  eodPrice = eod
  dtStartPrice = dtStart
  dtTopPrice = dtTop
  dtLowPrice = dtLow
  dtRetestPrice = dtRetest
  this.dtStartTime = dtStartTime
  this.dtTopTime = dtTopTime
  this.dtLowTime = dtLowTime
  this.dtRetestTime = dtRetestTime

  ssr = request.ssr
  this.noPush = noPush
  highInstitutions = request.highInstitutions
}

private fun BigDecimal?.required(label: String): BigDecimal =
  (this ?: throw badRequest("$label is required")).requirePositive(label)

internal fun StatEntryRequest.cleanTicker(): String =
  ticker.trim().uppercase().ifEmpty { throw badRequest("Ticker must not be blank") }

/**
 * The day's range holds every price it contains (#305) : `LOD <= open, push, EOD <= HOD`. The HOD /
 * LOD pair was checked, the three prices inside were not — a stat could carry a HOD of 1 under a
 * push of 10 and still be ticked.
 */
internal fun requireInsideTheDay(
  hod: BigDecimal?,
  lod: BigDecimal?,
  prices: List<Pair<String, BigDecimal?>>,
) {
  if (hod != null && lod != null && hod < lod) throw badRequest("HOD must not be below the LOD")
  for ((label, price) in prices) {
    if (price == null) continue
    if (hod != null && price > hod) throw badRequest("$label must not be above the HOD")
    if (lod != null && price < lod) throw badRequest("$label must not be below the LOD")
  }
}

/**
 * The shape of a double top (`docs/pattern/DT.md`) : the top not under the start, the rejection low
 * not above the top, the retest not under the low. Each pair is checked once both are in.
 */
internal fun requireDoubleTopShape(
  start: BigDecimal?,
  top: BigDecimal?,
  low: BigDecimal?,
  retest: BigDecimal?,
) {
  if (start != null && top != null && top < start) {
    throw badRequest("Top must not be below the start")
  }
  if (top != null && low != null && low > top) {
    throw badRequest("Rejection low must not be above the top")
  }
  if (low != null && retest != null && retest < low) {
    throw badRequest("Retest must not be below the rejection low")
  }
}

/**
 * The four moments of a double top go in order (#469) : start ≤ top ≤ low ≤ retest. Each time is
 * checked against the latest one typed before it, so a gap in the middle still orders the rest.
 */
internal fun requireDoubleTopTimesInOrder(
  start: LocalTime?,
  top: LocalTime?,
  low: LocalTime?,
  retest: LocalTime?,
) {
  var previous: Pair<String, LocalTime>? = null
  for ((label, time) in
    listOf("Start" to start, "Top" to top, "Rejection low" to low, "Retest" to retest)) {
    if (time == null) continue
    previous?.let { (previousLabel, previousTime) ->
      if (time < previousTime) {
        throw badRequest("$label time must not be before the ${previousLabel.lowercase()} time")
      }
    }
    previous = label to time
  }
}

/** To the minute, inside TradeZero's extended session — a premarket DT is real, 02:10 a typo. */
private fun LocalTime.inSession(label: String): LocalTime =
  truncatedTo(ChronoUnit.MINUTES).also {
    if (it < SESSION_OPENS || it > SESSION_CLOSES) {
      throw badRequest("$label must be between $SESSION_OPENS and $SESSION_CLOSES")
    }
  }

/** [premarket] stands in for this stat's own, which a double top does not keep (#649). */
internal fun StatEntry.siblingRequest(pattern: Pattern, premarket: Premarket? = null) =
  StatEntryRequest(
    tradeDate = tradeDate,
    pattern = pattern,
    ticker = ticker,
    previousClose = premarket?.previousClose ?: previousClose,
    pmOpen = premarket?.pmOpen ?: pmOpen,
    pmHigh = premarket?.pmHigh ?: pmHigh,
    floatMillions = floatMillions,
    volumeMillions = volumeMillions,
    // A DT born from a GUS starts from its open ; a GUS born from a DT has no session to take.
    openPrice = openPrice,
    ssr = ssr,
    highInstitutions = highInstitutions,
  )
