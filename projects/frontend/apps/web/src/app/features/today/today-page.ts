import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { StbButtonModule, StbChipsModule, StbIconModule, StbToast } from '@portfolioai/ui';
import { endOfWeek, startOfWeek } from 'date-fns';
import { EMPTY, catchError, filter, switchMap, tap } from 'rxjs';
import { AccountSummary } from '../../core/api/account/account.model';
import { AccountRepository } from '../../core/api/account/account.repository';
import { Candidate } from '../../core/api/candidates/candidates.model';
import { CandidatesRepository } from '../../core/api/candidates/candidates.repository';
import { JournalRepository } from '../../core/api/journal/journal.repository';
import { JournalSummary, TradeEntry } from '../../core/api/journal/trade-entry.model';
import { StatEntry } from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { MorningReconciliation } from '../account/morning-reconciliation/morning-reconciliation';
import { gapPercent, pushPercent } from '../candidates/candidates.math';

/** Where the trading day stands, from the New York clock. */
export type MarketStatus = 'PREMARKET' | 'OPEN' | 'CLOSED';

/** The five steps of the day, in order. */
export type StepKey = 'reconciliation' | 'candidates' | 'session' | 'stats' | 'trades';
const STEPS: readonly StepKey[] = ['reconciliation', 'candidates', 'session', 'stats', 'trades'];

/** `done` = behind us, `current` = what to do now, `todo` = not yet. */
export type StepState = 'done' | 'current' | 'todo';

/** Minutes since midnight, New York time — the session boundaries are wall-clock over there. */
const PREMARKET_OPEN = 4 * 60;
const SESSION_OPEN = 9 * 60 + 30;
const SESSION_CLOSE = 16 * 60;

/** Overdue stats named on step 4 ; the rest is counted. */
const OVERDUE_SHOWN = 5;

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
 * **The five steps** carry a state derived from the data and from the New York clock, never from a
 * stored flag : morning reconciliation (done inline, step 1 hosts the same block as the account
 * page), candidates captured, session (nothing to do in the app), stats completed after the 4 pm
 * close, trades entered. The first step that isn't behind us is the current one — that is the whole
 * point of the page, so it must be right whatever time it is opened.
 *
 * **The side column** answers the questions asked between two steps : where the balance stands and
 * whether it was reconciled, the P&L of the day / week / month, the candidates captured today and
 * the trades of the week.
 *
 * Everything is read from endpoints that already exist — this page adds no backend of its own.
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
    TranslatePipe,
  ],
})
export class TodayPage {
  private readonly accountRepo = inject(AccountRepository);
  private readonly candidatesRepo = inject(CandidatesRepository);
  private readonly statsRepo = inject(StatsRepository);
  private readonly journalRepo = inject(JournalRepository);
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

  /** Candidates of the day still waiting to be promoted — step 2's « promote the rest » action. */
  readonly pendingCandidates = computed(() => this.candidates().filter((c) => !c.promoted));
  /**
   * Step 4 counts every stat still to complete, whatever its day (#337) : a stat left half-filled
   * on an earlier day is overdue, and nothing else in the daily flow would point at it.
   */
  readonly statsToCompleteToday = computed(() =>
    this.statsToComplete().filter((s) => isSameDay(s.tradeDate, this.today)),
  );
  readonly overdueStats = computed(() =>
    this.statsToComplete().filter((s) => !isSameDay(s.tradeDate, this.today)),
  );
  /** The day's stats come first (newest first), so every stat past them is overdue. */
  readonly overdueTotal = computed(
    () => (this.statsToCompleteTotal() ?? 0) - this.statsToCompleteToday().length,
  );
  /**
   * « GLND (21/09), KTTA (17/09) » — overdue stats carry their day, the ticker alone is ambiguous.
   * Capped : it is the one list of the page whose length has no bound.
   */
  readonly overdueLine = computed(() => {
    const dayMonth = new Intl.DateTimeFormat(this.locale, { day: '2-digit', month: '2-digit' });
    const shown = this.overdueStats().slice(0, OVERDUE_SHOWN);
    return {
      tickers: shown.map((s) => `${s.ticker} (${dayMonth.format(s.tradeDate)})`).join(', '),
      more: this.overdueTotal() - shown.length,
    };
  });

  /** Whether each step is behind us, from the data and the clock. */
  private readonly done = computed<Record<StepKey, boolean>>(() => ({
    reconciliation: this.reconciledToday(),
    // Captured is not enough : the step is done once every candidate is in the stats sheet (#337).
    candidates: this.candidates().length > 0 && this.pendingCandidates().length === 0,
    // The session is behind us once New York has closed — there is nothing to do in the app while
    // it runs, so it can't be "done" any earlier.
    session: this.marketStatus === 'CLOSED' && newYorkMinutes(this.today).minutes >= SESSION_CLOSE,
    // Pending candidates are stats not created yet : without them, step 4 would tick and then
    // untick as soon as step 2 promotes them.
    stats:
      this.candidates().length > 0 &&
      this.pendingCandidates().length === 0 &&
      this.statsToCompleteTotal() === 0,
    trades: this.todayTrades().length > 0,
  }));

  /**
   * The first step that isn't done is the current one ; everything after it is still to come. A day
   * where everything is done leaves no current step — nothing is asked of the user anymore.
   */
  readonly stepStates = computed<Record<StepKey, StepState>>(() => {
    const done = this.done();
    const current = STEPS.find((key) => !done[key]);
    return STEPS.reduce(
      (acc, key) => {
        acc[key] = done[key] ? 'done' : key === current ? 'current' : 'todo';
        return acc;
      },
      {} as Record<StepKey, StepState>,
    );
  });

  readonly doneCount = computed(() => STEPS.filter((key) => this.done()[key]).length);

  constructor() {
    this.fetch();
  }

  /** The morning block settled : the balance moved, and step 1 is behind us. */
  onReconciled(): void {
    this.reconciledToday.set(true);
    this.accountRepo.getSummary().subscribe({
      next: (s) => this.accountSummary.set(s),
      error: () => this.accountSummary.set(null),
    });
  }

  /**
   * « Promote the remaining candidates » of step 2 — a creation, so it goes through the
   * confirmation modal, which names the tickers about to become stats.
   */
  promoteRemaining(): void {
    const pending = this.pendingCandidates();
    if (pending.length === 0) return;
    this.confirm
      .ask('today.steps.candidates.confirmPromote', {
        params: { count: pending.length, tickers: pending.map((c) => c.ticker).join(', ') },
      })
      .pipe(
        filter(Boolean),
        switchMap(() => this.candidatesRepo.promoteDay(this.today)),
        tap((result) => {
          this.toasts.success(
            this.translate.instant('today.snackbar.promoteSuccess', {
              count: result.promoted.length,
            }),
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

  /** « KTTA, BNZI, SNTG » — the tickers of a list, for the one-line recap of a step. */
  tickersOf(rows: { ticker: string }[]): string {
    return rows.map((r) => r.ticker).join(', ');
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

    this.accountRepo.getSummary().subscribe({
      next: (s) => this.accountSummary.set(s),
      error: () => this.accountSummary.set(null),
    });
    // Step 1's own block loads the history too ; the page reads it for the side column and for the
    // step state, which it needs even before the block is rendered.
    this.accountRepo.reconciliations(1).subscribe({
      next: (rows) =>
        this.reconciledToday.set(rows.some((r) => isSameDay(r.valueDate, this.today))),
      error: () => this.reconciledToday.set(false),
    });
    this.candidatesRepo.listForDate(this.today).subscribe({
      next: (rows) => this.candidates.set(rows),
      error: () => this.candidates.set([]),
    });
    this.statsRepo
      .findAll(
        { status: 'TO_COMPLETE' },
        { pageIndex: 0, pageSize: 50, sortField: 'tradeDate', sortDirection: 'desc' },
      )
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
    this.journalRepo.findAll(day, { pageIndex: 0, pageSize: 20 }).subscribe({
      next: (page) => this.todayTrades.set(page.content),
      error: () => this.todayTrades.set([]),
    });
    this.journalRepo.findAll(week, { pageIndex: 0, pageSize: 20 }).subscribe({
      next: (page) => this.weekTrades.set(page.content),
      error: () => this.weekTrades.set([]),
    });
    this.journalRepo.summary(day).subscribe({ next: (s) => this.dayPnl.set(s) });
    this.journalRepo.summary(week).subscribe({ next: (s) => this.weekPnl.set(s) });
    this.journalRepo.summary(month).subscribe({ next: (s) => this.monthPnl.set(s) });
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
