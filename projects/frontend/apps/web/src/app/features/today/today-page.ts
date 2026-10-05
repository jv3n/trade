import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbChipsModule,
  StbIconModule,
  StbSkeleton,
  StbToast,
  stbLoadGate,
} from '@portfolioai/ui';
import {
  differenceInCalendarDays,
  endOfWeek,
  startOfWeek,
  subBusinessDays,
  subDays,
} from 'date-fns';
import { EMPTY, catchError, filter, finalize, switchMap, tap } from 'rxjs';
import { AccountSummary } from '../../core/api/account/account.model';
import { AccountRepository } from '../../core/api/account/account.repository';
import { Candidate } from '../../core/api/candidates/candidates.model';
import { CandidatesRepository } from '../../core/api/candidates/candidates.repository';
import { JournalRepository } from '../../core/api/journal/journal.repository';
import { JournalSummary, TradeEntry } from '../../core/api/journal/trade-entry.model';
import { PATTERNS } from '../../core/api/shared/pattern.model';
import { StatEntry } from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { TradingDay, TradingDayMarks } from '../../core/api/trading-day/trading-day.model';
import { TradingDayRepository } from '../../core/api/trading-day/trading-day.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { PluralPipe, pluralKey } from '../../shared/plural/plural';
import { MorningReconciliation } from '../account/morning-reconciliation/morning-reconciliation';
import { gapPercent, pushPercent } from '../candidates/candidates.math';

/** Where the trading day stands, from the New York clock. */
export type MarketStatus = 'PREMARKET' | 'OPEN' | 'CLOSED';

/** The five steps of the day, in order. */
export type StepKey = 'reconciliation' | 'candidates' | 'session' | 'stats' | 'trades';
/**
 * The morning opens on yesterday's stats (#531) : the app is only opened in the morning, so the
 * stats of a session are completed the next day, before anything else.
 */
const STEPS: readonly StepKey[] = ['stats', 'reconciliation', 'candidates', 'session', 'trades'];

/**
 * `done` = behind us, `none` = nothing to do today, as the user declared it (#407), `current` =
 * what to do now, `todo` = not yet.
 */
export type StepState = 'done' | 'none' | 'current' | 'todo';

/** The calls a step's state is read from — the side column's figures are not among them. */
type StepSource = 'reconciliations' | 'candidates' | 'stats' | 'trades' | 'tradingDay';
const STEP_SOURCES: readonly StepSource[] = [
  'reconciliations',
  'candidates',
  'stats',
  'trades',
  'tradingDay',
];

/** Minutes since midnight, New York time — the session boundaries are wall-clock over there. */
const PREMARKET_OPEN = 4 * 60;
const SESSION_OPEN = 9 * 60 + 30;
const SESSION_CLOSE = 16 * 60;

/** Overdue stats named on step 4 ; the rest is counted. */
const OVERDUE_SHOWN = 5;

/** A ticker with a GUS and a DT to complete lists its two stats side by side (#451). */
const byTickerThenPattern = (a: StatEntry, b: StatEntry): number =>
  a.ticker.localeCompare(b.ticker) || PATTERNS.indexOf(a.pattern) - PATTERNS.indexOf(b.pattern);

/**
 * Reads the New York wall clock : the trading day is defined over there, so deriving the day's
 * state from the browser's own timezone would put the user's evening in the middle of the session.
 */
export function newYorkMinutes(now: Date): { minutes: number; weekend: boolean } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = value('weekday');
  return {
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
    weekend: weekday === 'Sat' || weekday === 'Sun',
  };
}

export function marketStatusAt(now: Date): MarketStatus {
  const { minutes, weekend } = newYorkMinutes(now);
  if (weekend) return 'CLOSED';
  if (minutes >= SESSION_OPEN && minutes < SESSION_CLOSE) return 'OPEN';
  if (minutes >= PREMARKET_OPEN && minutes < SESSION_OPEN) return 'PREMARKET';
  return 'CLOSED';
}

/**
 * « Aujourd'hui » — the home page, and the only screen that walks through the trading day instead
 * of leaving the user to remember where they are (`mockup/aujourdhui.html`, `PARCOURS.md` ›
 * Accueil).
 *
 * **The five steps** carry a state derived from the data and from the New York clock : morning
 * reconciliation (done inline, step 1 hosts the same block as the account
 * page), candidates captured, session (nothing to do in the app), stats completed after the 4 pm
 * close, trades entered. The first step that isn't behind us is the current one — that is the whole
 * point of the page, so it must be right whatever time it is opened. The one stored input is the
 * day's « nothing today » marks (#407) — no candidate, no trade — and the data beats them : a
 * candidate or a trade entered afterwards puts the step back on its normal state.
 *
 * **The side column** answers the questions asked between two steps : where the balance stands and
 * whether it was reconciled, the P&L of the day / week / month, the candidates captured today and
 * the trades of the week.
 *
 */
@Component({
  selector: 'app-today-page',
  templateUrl: './today-page.html',
  styleUrl: './today-page.scss',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    StbButtonModule,
    StbChipsModule,
    StbIconModule,
    MorningReconciliation,
    PluralPipe,
    TranslatePipe,
    StbSkeleton,
  ],
})
export class TodayPage {
  private readonly accountRepo = inject(AccountRepository);
  private readonly candidatesRepo = inject(CandidatesRepository);
  private readonly statsRepo = inject(StatsRepository);
  private readonly journalRepo = inject(JournalRepository);
  private readonly tradingDayRepo = inject(TradingDayRepository);
  private readonly confirm = inject(ConfirmService);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(StbToast);
  private readonly locale = inject(LOCALE_ID);

  /** Captured once : the page is mounted fresh on every visit, and the day doesn't turn under it. */
  readonly today = new Date();
  readonly marketStatus = marketStatusAt(this.today);
  readonly steps = STEPS;

  // ---- What the day is made of ----
  readonly accountSummary = signal<AccountSummary | null>(null);
  readonly reconciledToday = signal(false);
  readonly candidates = signal<Candidate[]>([]);
  /** Newest first, one page : the count of the step comes from [statsToCompleteTotal]. */
  readonly statsToComplete = signal<StatEntry[]>([]);
  /** `null` until the stats answer, or when they fail : unknown is not « nothing left ». */
  readonly statsToCompleteTotal = signal<number | null>(null);
  readonly todayTrades = signal<TradeEntry[]>([]);
  readonly weekTrades = signal<TradeEntry[]>([]);
  readonly dayPnl = signal<JournalSummary | null>(null);
  readonly weekPnl = signal<JournalSummary | null>(null);
  readonly monthPnl = signal<JournalSummary | null>(null);
  /** The day's « nothing today » marks, as stored — `null` until read, or when the read fails. */
  readonly tradingDay = signal<TradingDay | null>(null);
  readonly savingMarks = signal(false);

  /** Step sources still unanswered — a failed one counts as answered, it won't come back. */
  private readonly pendingSources = signal<ReadonlySet<StepSource>>(new Set(STEP_SOURCES));
  /**
   * Every source a step reads has answered (#544) : before that the steps would read « to do » or
   * « nothing today » off empty data, so they show as a skeleton.
   */
  readonly stepsLoaded = computed(() => this.pendingSources().size === 0);
  readonly gate = stbLoadGate(() => !this.stepsLoaded());

  /**
   * Candidates of the day without any stat — step 2's « Passer les N en GUS » action. A candidate
   * with only a DT counts as promoted.
   */
  readonly pendingCandidates = computed(() =>
    this.candidates().filter((c) => c.stats.length === 0),
  );
  /**
   * Step 1 counts the stats still to complete **before today** (#531) — the day's own cannot be
   * completed before its session. The previous trading day is the normal case ; anything older is
   * overdue (#337), and nothing else in the daily flow would point at it.
   */
  // Weekends only : the morning after a market holiday reads the day before it as overdue (amber),
  // which leaves the count, the done state and the action untouched — accepted (#531).
  private readonly previousTradingDay = subBusinessDays(this.today, 1);
  readonly yesterdayStats = computed(() =>
    this.statsToComplete()
      .filter((s) => differenceInCalendarDays(s.tradeDate, this.previousTradingDay) >= 0)
      .sort(byTickerThenPattern),
  );
  readonly overdueStats = computed(() =>
    this.statsToComplete()
      .filter((s) => differenceInCalendarDays(s.tradeDate, this.previousTradingDay) < 0)
      .sort((a, b) => b.tradeDate.getTime() - a.tradeDate.getTime() || byTickerThenPattern(a, b)),
  );
  /** Yesterday's stats come first (newest first), so every stat past them is overdue. */
  readonly overdueTotal = computed(
    () => (this.statsToCompleteTotal() ?? 0) - this.yesterdayStats().length,
  );
  /**
   * « GLND GUS (21/09), KTTA DT (17/09) » — overdue stats carry their day, the ticker alone is ambiguous.
   * Capped : it is the one list of the page whose length has no bound.
   */
  readonly overdueLine = computed(() => {
    const dayMonth = new Intl.DateTimeFormat(this.locale, { day: '2-digit', month: '2-digit' });
    const shown = this.overdueStats().slice(0, OVERDUE_SHOWN);
    return {
      tickers: shown
        .map((s) => `${this.statLabel(s)} (${dayMonth.format(s.tradeDate)})`)
        .join(', '),
      more: this.overdueTotal() - shown.length,
    };
  });

  /** « Aucun candidat aujourd'hui » holds only while the day really has none : the data wins. */
  readonly noCandidateToday = computed(
    () => this.tradingDay()?.noCandidateAt != null && this.candidates().length === 0,
  );
  readonly noTradeToday = computed(
    () => this.tradingDay()?.noTradeAt != null && this.todayTrades().length === 0,
  );

  /** Whether each step is behind us, from the data and the clock. */
  private readonly done = computed<Record<StepKey, boolean>>(() => ({
    reconciliation: this.reconciledToday(),
    // Captured is not enough : the step is done once every candidate has a stat (#337).
    candidates: this.candidates().length > 0 && this.pendingCandidates().length === 0,
    // The session is behind us once New York has closed — there is nothing to do in the app while
    // it runs, so it can't be "done" any earlier.
    session: this.marketStatus === 'CLOSED' && newYorkMinutes(this.today).minutes >= SESSION_CLOSE,
    // Nothing left before today — a morning with nothing to finish is simply done. Unknown is not
    // « nothing left ».
    stats: this.statsToCompleteTotal() === 0,
    trades: this.todayTrades().length > 0,
  }));

  /**
   * Steps declared empty for the day (#407). The stats step never is : it looks at the days before
   * today (#531), which a mark about today says nothing of.
   */
  private readonly none = computed<Record<StepKey, boolean>>(() => ({
    reconciliation: false,
    candidates: this.noCandidateToday(),
    session: false,
    stats: false,
    trades: this.noTradeToday(),
  }));

  /**
   * The first step that is neither done nor empty is the current one ; everything after it is
   * still to come. A day where everything is settled leaves no current step — nothing is asked of
   * the user anymore.
   */
  readonly stepStates = computed<Record<StepKey, StepState>>(() => {
    const done = this.done();
    const none = this.none();
    const current = STEPS.find((key) => !done[key] && !none[key]);
    return STEPS.reduce(
      (acc, key) => {
        acc[key] = done[key] ? 'done' : none[key] ? 'none' : key === current ? 'current' : 'todo';
        return acc;
      },
      {} as Record<StepKey, StepState>,
    );
  });

  /** « Nothing today » counts : the step is settled, which is what the progress reads. */
  readonly doneCount = computed(
    () => STEPS.filter((key) => this.done()[key] || this.none()[key]).length,
  );

  constructor() {
    this.fetch();
  }

  /**
   * The morning block settled — reconciled *or* cancelled, it emits the same output : the balance
   * moved, and step 1 is re-read rather than assumed done (#425).
   */
  onSettled(): void {
    this.fetchAccount();
  }

  /**
   * « Passer les N en GUS » of step 2 — a creation, so it goes through the confirmation modal,
   * which names the tickers about to become GUS stats. Never a DT : it is chosen by hand.
   */
  promoteRemaining(): void {
    const pending = this.pendingCandidates();
    if (pending.length === 0) return;
    this.confirm
      .ask(pluralKey('today.steps.candidates.confirmPromote', pending.length, this.locale), {
        params: { count: pending.length, tickers: pending.map((c) => c.ticker).join(', ') },
      })
      .pipe(
        filter(Boolean),
        switchMap(() => this.candidatesRepo.promoteDay(this.today)),
        tap((result) => {
          this.toasts.success(
            this.translate.instant(
              pluralKey('today.snackbar.promoteSuccess', result.promoted.length, this.locale),
              { count: result.promoted.length },
            ),
          );
          this.fetch();
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('today.snackbar.promoteError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /**
   * Sets or clears one « nothing today » mark (#407). No confirmation : nothing is created or
   * deleted, and the step shows its own « Annuler ». The other mark is written back as stored —
   * so nothing is written while the marks are unknown, or a failed read would clear the other one.
   */
  setMark(mark: keyof TradingDayMarks, value: boolean): void {
    const stored = this.tradingDay();
    if (this.savingMarks() || stored === null) return;
    const marks: TradingDayMarks = {
      noCandidate: stored.noCandidateAt !== null,
      noTrade: stored.noTradeAt !== null,
      [mark]: value,
    };
    this.savingMarks.set(true);
    this.tradingDayRepo.put(this.today, marks).subscribe({
      next: (day) => {
        this.tradingDay.set(day);
        this.savingMarks.set(false);
      },
      error: () => {
        this.toasts.error(this.translate.instant('today.snackbar.markError'));
        this.savingMarks.set(false);
      },
    });
  }

  /** « KTTA, BNZI, SNTG » — the tickers of a list, for the one-line recap of a step. */
  tickersOf(rows: { ticker: string }[]): string {
    return rows.map((r) => r.ticker).join(', ');
  }

  /** « FRESH1 GUS, FRESH1 DT » — a ticker can have one stat per pattern, so each carries it. */
  statsOf(stats: StatEntry[]): string {
    return stats.map((s) => this.statLabel(s)).join(', ');
  }

  private statLabel(stat: StatEntry): string {
    return `${stat.ticker} ${this.translate.instant('patterns.short.' + stat.pattern)}`;
  }

  gapOf(candidate: Candidate): number | null {
    return gapPercent(candidate.previousClose, candidate.pmOpen);
  }

  pushOf(candidate: Candidate): number | null {
    return pushPercent(candidate.pmOpen, candidate.pmHigh);
  }

  private fetch(): void {
    const day = { dateFrom: this.today, dateTo: this.today };
    const week = {
      dateFrom: startOfWeek(this.today, { weekStartsOn: 1 }),
      dateTo: endOfWeek(this.today, { weekStartsOn: 1 }),
    };
    const month = computeMonthRange(this.today);

    this.fetchAccount();
    this.candidatesRepo
      .listForDate(this.today)
      .pipe(finalize(() => this.answered('candidates')))
      .subscribe({
        next: (rows) => this.candidates.set(rows),
        error: () => this.candidates.set([]),
      });
    this.statsRepo
      .findAll(
        { status: 'TO_COMPLETE', dateTo: subDays(this.today, 1) },
        { pageIndex: 0, pageSize: 50, sortField: 'tradeDate', sortDirection: 'desc' },
      )
      .pipe(finalize(() => this.answered('stats')))
      .subscribe({
        next: (page) => {
          this.statsToComplete.set(page.content);
          this.statsToCompleteTotal.set(page.totalElements);
        },
        error: () => {
          this.statsToComplete.set([]);
          this.statsToCompleteTotal.set(null);
        },
      });
    this.journalRepo
      .findAll(day, { pageIndex: 0, pageSize: 20 })
      .pipe(finalize(() => this.answered('trades')))
      .subscribe({
        next: (page) => this.todayTrades.set(page.content),
        error: () => this.todayTrades.set([]),
      });
    this.journalRepo.findAll(week, { pageIndex: 0, pageSize: 20 }).subscribe({
      next: (page) => this.weekTrades.set(page.content),
      error: () => this.weekTrades.set([]),
    });
    this.tradingDayRepo
      .get(this.today)
      .pipe(finalize(() => this.answered('tradingDay')))
      .subscribe({
        next: (d) => this.tradingDay.set(d),
        error: () => this.tradingDay.set(null),
      });
    this.journalRepo.summary(day).subscribe({ next: (s) => this.dayPnl.set(s) });
    this.journalRepo.summary(week).subscribe({ next: (s) => this.weekPnl.set(s) });
    this.journalRepo.summary(month).subscribe({ next: (s) => this.monthPnl.set(s) });
  }

  private answered(source: StepSource): void {
    this.pendingSources.update((pending) => {
      const next = new Set(pending);
      next.delete(source);
      return next;
    });
  }

  private fetchAccount(): void {
    this.accountRepo.getSummary().subscribe({
      next: (s) => this.accountSummary.set(s),
      error: () => this.accountSummary.set(null),
    });
    // Step 1's own block loads the history too ; the page reads it for the side column and for the
    // step state, which it needs even before the block is rendered.
    this.accountRepo
      .reconciliations(1)
      .pipe(finalize(() => this.answered('reconciliations')))
      .subscribe({
        next: (rows) =>
          this.reconciledToday.set(rows.some((r) => isSameDay(r.valueDate, this.today))),
        error: () => this.reconciledToday.set(false),
      });
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function computeMonthRange(now: Date): { dateFrom: Date; dateTo: Date } {
  return {
    dateFrom: new Date(now.getFullYear(), now.getMonth(), 1),
    dateTo: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}
