package com.portfolioai.devdata

import com.portfolioai.account.domain.AccountMovement
import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.auth.application.UserCreatedEvent
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.journal.application.TradeChangedEvent
import com.portfolioai.journal.domain.ExecutionKind
import com.portfolioai.journal.domain.TradeDirection
import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.domain.TradePositionCalculator
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import kotlin.math.roundToInt
import kotlin.random.Random
import org.slf4j.LoggerFactory
import org.springframework.context.ApplicationEventPublisher
import org.springframework.context.annotation.Profile
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Fills a fresh local account with a year of plausible activity : stats, trades with their
 * executions, and the deposits / withdrawals behind the balance curve. Without it the account
 * chart, the journal filters and the stats KPIs have nothing to chew on after a database purge.
 *
 * Runs on [UserCreatedEvent] rather than at boot : a purge takes the `app_user` row with it, so
 * there is nobody to seed until the dev comes back through SSO. The profile expression also keeps
 * it away from the no-auth bypass — local development logs in for real (see #235).
 *
 * Trades go in through the real path — aggregates from [TradePositionCalculator], then a
 * [TradeChangedEvent] so the `account` module creates the linked `TRADE` movement itself. Seeded
 * data therefore obeys the same invariants as data typed in the UI.
 *
 * To regenerate : purge the database, log back in.
 */
@Component
@Profile("local & !local-no-auth")
class LocalDataSeeder(
  private val users: UserRepository,
  private val stats: StatEntryRepository,
  private val trades: TradeEntryRepository,
  private val movements: AccountMovementRepository,
  private val events: ApplicationEventPublisher,
) {

  private val log = LoggerFactory.getLogger(javaClass)

  // Fixed seed : two devs comparing a screenshot should be looking at the same curve.
  private val random = Random(20260920L)

  /**
   * Inside the login transaction : the account is populated by the time the first page loads, and a
   * failure here fails the login loudly instead of leaving a half-seeded database behind.
   */
  @EventListener
  @Transactional
  fun onUserCreated(event: UserCreatedEvent) {
    val user = users.findById(event.userId).orElse(null) ?: return
    if (movements.findByUserId(user.id).isNotEmpty()) return

    val today = LocalDate.now()
    val days = tradingDays(today.minusYears(1), today)
    seedCashFlow(user, days.first())
    var seeded = 0
    for (day in days) {
      val stat = stats.save(newStat(user, day))
      // A stat without a trade is the normal case : most candidates are watched, not traded.
      if (random.nextDouble() < TRADE_RATE) {
        seedTrade(user, stat, isLast = day == days.last())
        seeded++
      }
    }
    log.info("Seeded local dev data : userId={} stats={} trades={}", user.id, days.size, seeded)
  }

  /** Weekdays only — holidays aren't worth modelling for a dev fixture. */
  private fun tradingDays(start: LocalDate, end: LocalDate): List<LocalDate> =
    generateSequence(start) { it.plusDays(1) }
      .takeWhile { it <= end }
      .filter { it.dayOfWeek != DayOfWeek.SATURDAY && it.dayOfWeek != DayOfWeek.SUNDAY }
      .toList()

  /** The funding side of the ledger : the opening deposit, two top-ups and one withdrawal. */
  private fun seedCashFlow(user: User, start: LocalDate) {
    movement(user, AccountMovementType.DEPOSIT, "25000.00", start, "Opening deposit")
    movement(user, AccountMovementType.DEPOSIT, "5000.00", start.plusMonths(3), "Top-up")
    movement(user, AccountMovementType.WITHDRAWAL, "-3000.00", start.plusMonths(7), "Withdrawal")
    movement(user, AccountMovementType.DEPOSIT, "4000.00", start.plusMonths(10), "Top-up")
  }

  private fun movement(
    user: User,
    type: AccountMovementType,
    amount: String,
    date: LocalDate,
    note: String,
  ) {
    movements.save(
      AccountMovement(
        user = user,
        type = type,
        amount = BigDecimal(amount),
        valueDate = date,
        note = note,
      )
    )
  }

  /** A gap-up small cap : a premarket block, then the session prices read at the 4 pm close. */
  private fun newStat(user: User, day: LocalDate): StatEntry {
    val previousClose = rnd(0.90, 7.50)
    val pmOpen = previousClose * (1 + rnd(0.30, 1.40))
    val pmHigh = pmOpen * (1 + rnd(0.05, 0.35))
    val open = pmOpen * rnd(0.92, 1.08)
    val pushOpen = open * (1 + rnd(0.03, 0.28))
    val hod = maxOf(pmHigh, pushOpen) * rnd(1.00, 1.06)
    val lod = open * rnd(0.52, 0.90)
    val eod = lod * (1 + rnd(0.00, 0.28))
    return StatEntry(
      user = user,
      tradeDate = day,
      pattern = Pattern.GUS,
      ticker = TICKERS[random.nextInt(TICKERS.size)],
      previousClose = price(previousClose),
      pmOpen = price(pmOpen),
      pmHigh = price(pmHigh),
      floatMillions = amount(rnd(1.5, 45.0)),
      volumeMillions = amount(rnd(3.0, 90.0)),
      locatePerShare = price(rnd(0.005, 0.25)),
      openPrice = price(open),
      pushOpenPrice = price(pushOpen),
      hodPrice = price(hod),
      lodPrice = price(lod),
      eodPrice = price(eod),
      ssr = random.nextDouble() < 0.45,
      under1Dollar = previousClose < 1.0,
      entryAfter11am = random.nextDouble() < 0.2,
    )
  }

  /**
   * The trade born from [stat] : short the opening push, cover into the fade. [isLast] leaves the
   * position open (no exit) so the journal's status filter has a live row to show.
   */
  private fun seedTrade(user: User, stat: StatEntry, isLast: Boolean) {
    val entryPrice = stat.pushOpenPrice!!.toDouble() * rnd(0.96, 1.00)
    val won = random.nextDouble() < WIN_RATE
    val exitPrice =
      if (won) entryPrice * (1 - rnd(0.04, 0.18)) else entryPrice * (1 + rnd(0.03, 0.12))
    val shares = ((rnd(1500.0, 5000.0) / entryPrice / 50).roundToInt() * 50).coerceAtLeast(100)

    val legs = mutableListOf(leg(ExecutionKind.ENTRY, shares, entryPrice, LocalTime.of(9, 42)))
    if (!isLast) {
      // Scaling out in two clips is the usual shape ; a single cover is the exception.
      val firstClip = if (random.nextDouble() < 0.6) shares / 2 else shares
      legs += leg(ExecutionKind.EXIT, firstClip, exitPrice, LocalTime.of(10, 21))
      if (firstClip < shares) {
        val rest = shares - firstClip
        legs += leg(ExecutionKind.EXIT, rest, exitPrice * rnd(0.97, 1.03), LocalTime.of(11, 5))
      }
    }

    val trade =
      TradeEntry(
        user = user,
        statEntryId = stat.id,
        tradeDate = stat.tradeDate,
        ticker = stat.ticker,
        pattern = stat.pattern,
        direction = TradeDirection.SHORT,
        note = if (won) "Faded the opening push as planned." else "Covered late, it kept running.",
        errorNote = if (won) null else "Size too big for a stock that was still running.",
      )
    trade.replaceExecutions(legs)
    trade.applyAggregates(TradePositionCalculator.compute(trade.direction, legs))
    // Fees and slippage land on the statement : some trades carry the broker figure instead.
    if (!isLast && random.nextDouble() < 0.25) {
      trade.realProfitDollars = trade.profitDollars!!.subtract(amount(rnd(2.0, 18.0)))
    }

    val saved = trades.saveAndFlush(trade)
    events.publishEvent(
      TradeChangedEvent(
        tradeId = saved.id,
        userId = user.id,
        ticker = saved.ticker,
        tradeDate = saved.tradeDate,
        profitDollars = saved.retainedProfit,
      )
    )
  }

  private fun leg(kind: ExecutionKind, shares: Int, price: Double, at: LocalTime) =
    TradePositionCalculator.Leg(kind = kind, shares = shares, price = price(price), executedAt = at)

  private fun rnd(min: Double, max: Double) = min + random.nextDouble() * (max - min)

  private fun price(value: Double): BigDecimal =
    BigDecimal(value).setScale(4, RoundingMode.HALF_UP).coerceAtLeast(MIN_PRICE)

  private fun amount(value: Double): BigDecimal =
    BigDecimal(value).setScale(2, RoundingMode.HALF_UP)

  private companion object {
    const val TRADE_RATE = 0.45
    const val WIN_RATE = 0.62
    val MIN_PRICE: BigDecimal = BigDecimal("0.0100")
    val TICKERS =
      listOf(
        "SNTI",
        "HUDI",
        "BBIG",
        "GNS",
        "MEGL",
        "CENN",
        "JAGX",
        "AVTX",
        "SOPA",
        "ENVB",
        "CYN",
        "BTAI",
        "TOP",
        "NUKK",
        "MULN",
      )
  }
}
