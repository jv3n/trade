import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  LOCALE_ID,
  Resource,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  MatDialog,
  StbButtonModule,
  StbChipsModule,
  StbIconModule,
  StbSkeleton,
  StbToast,
  StbTooltipModule,
  stbLoadGate,
} from '@portfolioai/ui';
import {
  differenceInCalendarDays,
  endOfWeek,
  startOfWeek,
  subBusinessDays,
  subDays,
} from 'date-fns';
import { EMPTY, catchError, filter, map, switchMap, tap } from 'rxjs';
import { AccountRepository } from '../../core/api/account/account.repository';
import { Candidate } from '../../core/api/candidates/candidates.model';
import { CandidatesRepository } from '../../core/api/candidates/candidates.repository';
import { JournalRepository } from '../../core/api/journal/journal.repository';
import { TradeEntry } from '../../core/api/journal/trade-entry.model';
import { Locate, LocateInput } from '../../core/api/locates/locates.model';
import { LocatesRepository } from '../../core/api/locates/locates.repository';
import { ScannerRun } from '../../core/api/scanner/scanner.model';
import { ScannerRepository } from '../../core/api/scanner/scanner.repository';
import { PATTERNS } from '../../core/api/shared/pattern.model';
import { StatEntry } from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { TradingDayMarks } from '../../core/api/trading-day/trading-day.model';
import { TradingDayRepository } from '../../core/api/trading-day/trading-day.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { keptValue } from '../../shared/kept-value/kept-value';
import { sumCents } from '../../shared/locate-cost/locate-cost';
import { PluralPipe, pluralKey } from '../../shared/plural/plural';
import { MorningReconciliation } from '../account/morning-reconciliation/morning-reconciliation';
import { gapPercent, pushPercent } from '../candidates/candidates.math';
import { LocatesDialog, LocatesDialogData } from '../locates/locates-dialog/locates-dialog';
import { NewLocateDialog } from '../locates/new-locate-dialog/new-locate-dialog';

/** Where the trading day stands, from the New York clock. */
export type MarketStatus = 'PREMARKET' | 'OPEN' | 'CLOSED';

/** The steps of the day, in order — five, and the optional locates one. */
export type StepKey = 'reconciliation' | 'candidates' | 'locates' | 'session' | 'stats' | 'trades';
/**
 * The morning opens on yesterday's stats (#531) : the app is only opened in the morning, so the
 * stats of a session are completed the next day, before anything else.
 */
const STEPS: readonly StepKey[] = [
  'stats',
  'reconciliation',
  'candidates',
  'locates',
  'session',
  'trades',
];

/**
 * A locate is a cost recorded when it happens, not something owed every day (#625) : its step reads
 * done once there is one, and is never the current step nor counted in the progress.
 */
const OPTIONAL_STEPS: readonly StepKey[] = ['locates'];
const REQUIRED_STEPS = STEPS.filter((key) => !OPTIONAL_STEPS.includes(key));

/**
 * `done` = behind us, `none` = nothing to do today, as the user declared it (#407), `current` =
 * what to do now, `todo` = not yet.
 */
export type StepState = 'done' | 'none' | 'current' | 'todo';

/** Minutes since midnight, New York time — the session boundaries are wall-clock over there. */
const PREMARKET_OPEN = 4 * 60;
const SESSION_OPEN = 9 * 60 + 30;
const SESSION_CLOSE = 16 * 60;

/** Overdue stats named on step 1 ; the rest is counted. */
const OVERDUE_SHOWN = 5;

/**
 * How far back step 1 looks (#726) : an older stat can no longer be completed from memory — it stays
 * under the stats sheet's « À compléter » filter, off the morning's list.
 */
const OVERDUE_FLOOR_DAYS = 30;

/** One ticker's locates of the day, added up — a top-up is the same ticker. */
export interface TickerLocates {
  ticker: string;
  shares: number;
  /** The last price paid — where a top-up's price starts. */
  lastPrice: number;
}

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
 * **The five steps** carry a state derived from the data and from the New York clock : yesterday's
 * stats completed, morning reconciliation (done inline, step 2 hosts the same block as the account
 * page), candidates captured, session (nothing to do in the app), trades entered — with the
 * optional « shares located » (#625) between the candidates and the session, a key in place of a
 * number. The first step that isn't behind us is the current one — that is the whole point of the
 * page, so it must be right whatever time it is opened. The one stored input is the
 * day's « nothing today » marks (#407) — no candidate, no trade — and the data beats them : a
 * candidate or a trade entered afterwards puts the step back on its normal state.
 *
 * **The side column** answers the questions asked between two steps : where the balance stands and
 * whether it was reconciled, the P&L of the day / week / month, the candidates captured today and
 * the trades of the week.
 *
 * Each source is a resource of its own ; a write bumps the counter of what it moved — the whole
 * day, the account, the locates — folded into the params, so it supersedes a load in flight.
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
    StbTooltipModule,
  ],
})
export class TodayPage {
  private readonly accountRepo = inject(AccountRepository);
  private readonly candidatesRepo = inject(CandidatesRepository);
  private readonly statsRepo = inject(StatsRepository);
  private readonly journalRepo = inject(JournalRepository);
  private readonly tradingDayRepo = inject(TradingDayRepository);
  private readonly locatesRepo = inject(LocatesRepository);
  private readonly scannerRepo = inject(ScannerRepository);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(StbToast);
  private readonly locale = inject(LOCALE_ID);

  /** Captured once : the page is mounted fresh on every visit, and the day doesn't turn under it. */
  readonly today = new Date();
  readonly marketStatus = marketStatusAt(this.today);
  readonly steps = STEPS;
  readonly requiredStepCount = REQUIRED_STEPS.length;
  // Weekends only : the morning after a market holiday reads the day before it as overdue (amber),
  // which leaves the count, the done state and the action untouched — accepted (#531).
  private readonly previousTradingDay = subBusinessDays(this.today, 1);

  // ---- What the day is made of ----
  private readonly dayWrites = signal(0);
  private readonly accountWrites = signal(0);
  private readonly locateWrites = signal(0);
  private readonly dayRange = { dateFrom: this.today, dateTo: this.today };
  private readonly weekRange = {
    dateFrom: startOfWeek(this.today, { weekStartsOn: 1 }),
    dateTo: endOfWeek(this.today, { weekStartsOn: 1 }),
  };

  private readonly accountResource = rxResource({
    params: () => ({ day: this.dayWrites(), account: this.accountWrites() }),
    stream: () => this.accountRepo.getSummary(),
  });
  /**
   * Step 1's own block loads the history too ; the page reads it for the side column and for the
   * step state, which it needs even before the block is rendered.
   */
  private readonly reconciliationsResource = rxResource({
    params: () => ({ day: this.dayWrites(), account: this.accountWrites() }),
    stream: () => this.accountRepo.reconciliations(1),
  });
  private readonly candidatesResource = rxResource({
    params: () => ({ day: this.dayWrites() }),
    stream: () => this.candidatesRepo.listForDate(this.today),
  });
  private readonly locatesResource = rxResource({
    params: () => ({ day: this.dayWrites(), locates: this.locateWrites() }),
    stream: () => this.locatesRepo.listForDate(this.today),
  });
  private readonly statsResource = rxResource({
    params: () => ({ day: this.dayWrites() }),
    stream: () =>
      this.statsRepo.findAll(
        {
          status: 'TO_COMPLETE',
          dateFrom: subDays(this.today, OVERDUE_FLOOR_DAYS),
          dateTo: subDays(this.today, 1),
        },
        { pageIndex: 0, pageSize: 50, sortField: 'tradeDate', sortDirection: 'desc' },
      ),
  });
  /** Wrapped, so « never ran » (`{ run: null }`) is told from « not known yet » (`null`). */
  private readonly scannerRunResource = rxResource({
    params: () => ({ day: this.dayWrites() }),
    stream: () => this.scannerRepo.latestRun().pipe(map((run) => ({ run }))),
  });
  private readonly latestRun = keptValue(this.scannerRunResource);
  /**
   * The session the scanner's stats are of (#765) : the one its latest run read. The previous
   * business day stands in when the run is unknown, stale or failed to load — on the morning after
   * a market holiday that guess is the closed day, hence the run first. `undefined` while the run
   * is on its way : the split waits for it.
   */
  private readonly scanDay = computed<Date | undefined>(() => {
    const known = this.latestRun();
    if (known === null) {
      return this.scannerRunResource.status() === 'error' ? this.previousTradingDay : undefined;
    }
    const run = known.run;
    return run && !this.scannerLate(run) ? run.tradingDate : this.previousTradingDay;
  });
  /**
   * The scanner's stats to review of the session it read — named on step 1 (#765). Anything to
   * review older than that is the one-month backfill, counted apart.
   */
  private readonly scannedResource = rxResource({
    params: () => {
      const day = this.scanDay();
      return day && { day, writes: this.dayWrites() };
    },
    stream: ({ params }) =>
      this.statsRepo.findAll(
        { review: 'TO_REVIEW', dateFrom: params.day },
        { pageIndex: 0, pageSize: 50, sortField: 'ticker', sortDirection: 'asc' },
      ),
  });
  private readonly backfillResource = rxResource({
    params: () => {
      const day = this.scanDay();
      return day && { day, writes: this.dayWrites() };
    },
    stream: ({ params }) => this.statsRepo.countToReview({ dateTo: subDays(params.day, 1) }),
  });
  private readonly todayTradesResource = rxResource({
    params: () => ({ day: this.dayWrites() }),
    stream: () => this.journalRepo.findAll(this.dayRange, { pageIndex: 0, pageSize: 20 }),
  });
  private readonly weekTradesResource = rxResource({
    params: () => ({ day: this.dayWrites() }),
    stream: () => this.journalRepo.findAll(this.weekRange, { pageIndex: 0, pageSize: 20 }),
  });
  private readonly tradingDayResource = rxResource({
    params: () => ({ day: this.dayWrites() }),
    stream: () => this.tradingDayRepo.get(this.today),
  });
  private readonly dayPnlResource = rxResource({
    params: () => ({ day: this.dayWrites() }),
    stream: () => this.journalRepo.summary(this.dayRange),
  });
  private readonly weekPnlResource = rxResource({
    params: () => ({ day: this.dayWrites() }),
    stream: () => this.journalRepo.summary(this.weekRange),
  });
  private readonly monthPnlResource = rxResource({
    params: () => ({ day: this.dayWrites() }),
    stream: () => this.journalRepo.summary(computeMonthRange(this.today)),
  });

  readonly accountSummary = keptValue(this.accountResource);
  private readonly reconciliations = keptValue(this.reconciliationsResource);
  readonly reconciledToday = computed(
    () => this.reconciliations()?.some((r) => isSameDay(r.valueDate, this.today)) ?? false,
  );
  private readonly keptCandidates = keptValue(this.candidatesResource);
  readonly candidates = computed<Candidate[]>(() => this.keptCandidates() ?? []);
  private readonly keptLocates = keptValue(this.locatesResource);
  readonly dayLocates = computed(() => this.keptLocates() ?? []);
  private readonly statsPage = keptValue(this.statsResource);
  /** Newest first, one page : the count of the step comes from [statsToCompleteTotal]. */
  readonly statsToComplete = computed<StatEntry[]>(() => this.statsPage()?.content ?? []);
  /** `null` until the stats answer, or when they fail : unknown is not « nothing left ». */
  readonly statsToCompleteTotal = computed(() => this.statsPage()?.totalElements ?? null);
  private readonly scannedPage = keptValue(this.scannedResource);
  private readonly scannedStats = computed<StatEntry[]>(() => this.scannedPage()?.content ?? []);
  private readonly backfill = keptValue(this.backfillResource);
  /** Stats of the one-month backfill still to review — history, never overdue (#765). */
  readonly backfillCount = computed(() => this.backfill() ?? 0);
  /** `null` until both answer, or when one fails : unknown is not « nothing left ». */
  readonly statsToReviewTotal = computed(() => {
    const recent = this.scannedPage();
    const backfill = this.backfill();
    return recent === null || backfill === null ? null : recent.totalElements + backfill;
  });
  private readonly todayPage = keptValue(this.todayTradesResource);
  readonly todayTrades = computed<TradeEntry[]>(() => this.todayPage()?.content ?? []);
  private readonly weekPage = keptValue(this.weekTradesResource);
  readonly weekTrades = computed<TradeEntry[]>(() => this.weekPage()?.content ?? []);
  readonly dayPnl = keptValue(this.dayPnlResource);
  readonly weekPnl = keptValue(this.weekPnlResource);
  readonly monthPnl = keptValue(this.monthPnlResource);
  /** The day's « nothing today » marks, as stored — `null` until read, or when the read fails. */
  readonly tradingDay = keptValue(this.tradingDayResource);
  readonly savingMarks = signal(false);

  /** The sources a step's state is read from — the side column's figures are not among them. */
  private readonly stepSources: readonly Resource<unknown>[] = [
    this.reconciliationsResource,
    this.candidatesResource,
    this.locatesResource,
    this.statsResource,
    this.scannerRunResource,
    this.scannedResource,
    this.backfillResource,
    this.todayTradesResource,
    this.tradingDayResource,
  ];
  /**
   * Every source a step reads has answered (#544) : before that the steps would read « to do » or
   * « nothing today » off empty data, so they show as a skeleton. A failed one counts as answered —
   * it won't come back — and once they all have, a reload never puts the skeleton back.
   */
  readonly stepsLoaded = linkedSignal<boolean, boolean>({
    source: () => this.stepSources.every((r) => r.status() !== 'loading'),
    computation: (answered, previous) => previous?.value === true || answered,
  });
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
   * overdue (#337), and nothing else in the daily flow would point at it — for 30 days (#726).
   */
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

  /** « ven. 18/09 : NXTP, ICCT (GUS) · BNRG, CTNT (DT) » — what the scanner found, and when. */
  readonly scannedLine = computed(() => {
    const stats = this.scannedStats();
    const scanDay = this.scanDay();
    if (stats.length === 0 || !scanDay) return null;
    const day = new Intl.DateTimeFormat(this.locale, {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });
    return {
      day: day.format(scanDay),
      stats: PATTERNS.map((pattern) => ({
        pattern,
        tickers: stats.filter((s) => s.pattern === pattern).map((s) => s.ticker),
      }))
        .filter((group) => group.tickers.length > 0)
        .map(
          (group) =>
            `${group.tickers.join(', ')} (${this.translate.instant('patterns.short.' + group.pattern)})`,
        )
        .join(' · '),
    };
  });

  /**
   * When the scanner last ran and what it read (#765) — `late` and `failed` both amber ; a
   * `partial` run (#779) stays neutral, naming the tickers to check by hand : it worked. It blocks
   * nothing : without it, the step reads what was typed. Nothing is said while the run is unknown.
   */
  readonly scannerLine = computed(() => {
    const known = this.latestRun();
    if (known === null) return null;
    const run = known.run;
    const day = new Intl.DateTimeFormat(this.locale, {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });
    const time = new Intl.DateTimeFormat(this.locale, { hour: '2-digit', minute: '2-digit' });
    if (!run || this.scannerLate(run)) {
      return {
        key: 'scannerLate',
        warn: true,
        params: { day: day.format(this.previousTradingDay) },
      };
    }
    const params = {
      day: day.format(run.tradingDate),
      time: time.format(run.startedAt),
      tickers: run.tickersScanned,
      gus: run.gusFound,
      dt: run.dtFound,
      error: run.error ?? '',
      count: run.missedTickers.length,
      missed: run.missedTickers.join(', '),
    };
    if (run.error) return { key: 'scannerFailed', warn: true, params };
    if (run.missedTickers.length > 0) {
      const key = pluralKey('scannerPartial', run.missedTickers.length, this.locale);
      return { key, warn: false, params };
    }
    return { key: 'scannerRan', warn: false, params };
  });

  /**
   * Not run for the latest session : never, or its last run read an older one **and** was not
   * today's. A run of this morning that read the session before a holiday is on time — the
   * previous business day is the closed one.
   */
  private scannerLate(run: ScannerRun): boolean {
    return (
      differenceInCalendarDays(run.tradingDate, this.previousTradingDay) < 0 &&
      !isSameDay(run.startedAt, this.today)
    );
  }

  /** The day's locates, one row per ticker. */
  readonly locatesByTicker = computed<TickerLocates[]>(() => {
    const groups = new Map<string, Locate[]>();
    for (const l of this.dayLocates()) groups.set(l.ticker, [...(groups.get(l.ticker) ?? []), l]);
    return [...groups.entries()].map(([ticker, locates]) => ({
      ticker,
      shares: locates.reduce((sum, l) => sum + l.shares, 0),
      lastPrice: locates[locates.length - 1].pricePerShare,
    }));
  });
  readonly locatesTotal = computed(() => sumCents(this.dayLocates().map((l) => l.cost)));

  /** « Aucun candidat aujourd'hui » holds only while the day really has none : the data wins. */
  readonly noCandidateToday = computed(
    () => this.tradingDay()?.noCandidateAt != null && this.candidates().length === 0,
  );
  readonly noTradeToday = computed(
    () => this.tradingDay()?.noTradeAt != null && this.todayTrades().length === 0,
  );

  /** New York has closed : the session is behind us. */
  private readonly sessionOver =
    this.marketStatus === 'CLOSED' && newYorkMinutes(this.today).minutes >= SESSION_CLOSE;

  /** Whether each step is behind us, from the data and the clock. */
  private readonly done = computed<Record<StepKey, boolean>>(() => ({
    reconciliation: this.reconciledToday(),
    // Captured is not enough : the step is done once every candidate has a stat (#337).
    candidates: this.candidates().length > 0 && this.pendingCandidates().length === 0,
    locates: this.dayLocates().length > 0,
    // The session is behind us once New York has closed — there is nothing to do in the app while
    // it runs, so it can't be "done" any earlier.
    session: this.sessionOver,
    // Nothing left before today, to complete or to review (#765) — a morning with nothing to finish
    // is simply done. Unknown is not « nothing left ».
    stats: this.statsToCompleteTotal() === 0 && this.statsToReviewTotal() === 0,
    trades: this.todayTrades().length > 0,
  }));

  /**
   * Steps declared empty for the day (#407). The stats step never is : it looks at the days before
   * today (#531), which a mark about today says nothing of. The locates step never is : it is
   * optional, not owed.
   */
  private readonly none = computed<Record<StepKey, boolean>>(() => ({
    reconciliation: false,
    candidates: this.noCandidateToday(),
    locates: false,
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
    const current = REQUIRED_STEPS.find((key) => !done[key] && !none[key]);
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
    () => REQUIRED_STEPS.filter((key) => this.done()[key] || this.none()[key]).length,
  );

  /** Nothing located, and nothing left to locate : no candidate, or the session is over. */
  readonly nothingLocated = computed(
    () => this.dayLocates().length === 0 && (this.noCandidateToday() || this.sessionOver),
  );

  /**
   * The morning block settled — reconciled *or* cancelled, it emits the same output : the balance
   * moved, and step 1 is re-read rather than assumed done (#425).
   */
  onSettled(): void {
    this.accountWrites.update((n) => n + 1);
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
          this.dayWrites.update((n) => n + 1);
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
        this.tradingDayResource.value.set(day);
        this.savingMarks.set(false);
      },
      error: () => {
        this.toasts.error(this.translate.instant('today.snackbar.markError'));
        this.savingMarks.set(false);
      },
    });
  }

  /** « Louer » of the locates step : a new one, on any ticker. */
  addLocate(): void {
    this.dialog
      .open<NewLocateDialog, void, LocateInput | undefined>(NewLocateDialog, {
        width: '480px',
        maxWidth: '95vw',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .pipe(
        filter((input): input is LocateInput => !!input),
        switchMap((input) =>
          this.locatesRepo.create(input).pipe(
            tap((saved) => {
              this.toasts.success(
                this.translate.instant('locates.snackbar.createSuccess', { ticker: saved.ticker }),
              );
              this.locateWrites.update((n) => n + 1);
            }),
            catchError(() => {
              this.toasts.error(this.translate.instant('locates.snackbar.saveError'));
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }

  /** A ticker of the step : its locates of the day, to top up or fix. */
  openLocates(row: TickerLocates): void {
    const data: LocatesDialogData = {
      tradingDate: this.today,
      ticker: row.ticker,
      lastPrice: row.lastPrice,
      stockPrice: this.candidates().find((c) => c.ticker === row.ticker)?.pmOpen ?? null,
    };
    this.dialog
      .open<LocatesDialog, LocatesDialogData, boolean>(LocatesDialog, {
        data,
        width: '520px',
        maxWidth: '95vw',
        autoFocus: '.locate-add input',
      })
      .afterClosed()
      .pipe(filter(Boolean))
      .subscribe(() => this.locateWrites.update((n) => n + 1));
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
