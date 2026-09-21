import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  PageEvent,
  Sort,
  StbButtonModule,
  StbButtonToggleModule,
  StbCheckboxModule,
  StbChipsModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbPaginatorModule,
  StbProgressSpinnerModule,
  StbSelectModule,
  StbSortHeaderModule,
  StbTableModule,
  StbToast,
  StbTooltipModule,
} from '@portfolioai/ui';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  concatMap,
  debounceTime,
  distinctUntilChanged,
  filter,
  switchMap,
  tap,
} from 'rxjs';
import { PATTERNS, Pattern } from '../../core/api/shared/pattern.model';
import {
  StatEntry,
  StatEntryFilter,
  StatEntryInput,
  StatStatus,
  StatSummary,
} from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { NumberMaskDirective } from '../../shared/number-mask/number-mask.directive';
import { PeriodFilter } from '../../shared/period-filter/period-filter';
import { PeriodSelection } from '../../shared/period-preset/period-preset';
import { gapPercent, percentVsOpen, pmPushPercent } from './stats.math';

/** Sort state — controlled-component shape (empty `columnName` = the backend's DEFAULT_SORT). */
interface SortRequest {
  columnName: string;
  isAscending: boolean;
}

/** The session block being typed in the session panel. Numbers are null until typed. */
interface SessionModel {
  openPrice: number | null;
  pushOpenPrice: number | null;
  hodPrice: number | null;
  lodPrice: number | null;
  eodPrice: number | null;
  ssr: boolean;
  under1Dollar: boolean;
  entryAfter11am: boolean;
}

/** A listed stat with its derived percentages (never stored — recomputed from the prices). */
export interface StatRow extends StatEntry {
  gap: number | null;
  pmPush: number | null;
  pushOpenPercent: number | null;
  hodPercent: number | null;
  lodPercent: number | null;
  eodPercent: number | null;
  /** Label keys of the session prices still missing — the ✓ stays disabled until it's empty. */
  missing: string[];
}

/** Status tabs of the mockup : all / to complete / completed. */
const STATUS_TABS: readonly (StatStatus | null)[] = [null, 'TO_COMPLETE', 'COMPLETED'];

const DEFAULT_PAGE_SIZE = 25;

/** Empty session block — what the panel shows before a stat is picked. */
const BLANK_SESSION: SessionModel = {
  openPrice: null,
  pushOpenPrice: null,
  hodPrice: null,
  lodPrice: null,
  eodPrice: null,
  ssr: false,
  under1Dollar: false,
  entryAfter11am: false,
};

type SessionPrice = 'openPrice' | 'pushOpenPrice' | 'hodPrice' | 'lodPrice' | 'eodPrice';

/** The five session prices, in the sheet's order, with the label key naming them. */
const SESSION_PRICES: readonly { field: SessionPrice; label: string }[] = [
  { field: 'openPrice', label: 'stats.fields.openPriceShort' },
  { field: 'pushOpenPrice', label: 'stats.fields.pushOpen' },
  { field: 'hodPrice', label: 'stats.fields.hod' },
  { field: 'lodPrice', label: 'stats.fields.lod' },
  { field: 'eodPrice', label: 'stats.fields.eod' },
];

/** Label keys of the session prices still missing — what stands between a stat and its tick. */
export function missingPrices(session: Pick<SessionModel, SessionPrice>): string[] {
  return SESSION_PRICES.filter(({ field }) => !isPositive(session[field])).map((p) => p.label);
}

function sessionOf(entry: StatEntry): SessionModel {
  return {
    openPrice: entry.openPrice,
    pushOpenPrice: entry.pushOpenPrice,
    hodPrice: entry.hodPrice,
    lodPrice: entry.lodPrice,
    eodPrice: entry.eodPrice,
    ssr: entry.ssr,
    under1Dollar: entry.under1Dollar,
    entryAfter11am: entry.entryAfter11am,
  };
}

/**
 * Stats page — the sheet filled as the day goes and ticked once complete (cf. `mockup/stats.html`
 * and `mockup/PARCOURS.md`, step 5) :
 *
 * - **KPIs** over the filtered set (not the current page) : stats completed / to complete, average
 *   push at open, average LOD, fade at the close. They come from `GET /api/stats/summary`.
 * - **Session panel** : the premarket recap on top, then the session prices with their live % vs
 *   the open and the three flags — each saved on its own, when the field is left (an edit : no
 *   modal) — the « n / 5 » progress, Close, and the ✓ that ticks the stat once its five prices are
 *   in. It opens on the first stat to complete of the page and on any row's « Session » button.
 * - **The ✓ column** ticks / unticks a stat from the table (#263). A ticked stat can't lose a price :
 *   clearing one is refused with a toast — untick it first.
 * - **Table** in two column groups — Premarket (copied from the candidate) and Session (price + %
 *   vs the open) — then the flags. Every column is kept ; horizontal scrolling is fine.
 * - **Filters** : search, period (preset or custom range, shared [PeriodFilter]), pattern, status ;
 *   server-side sort + pagination.
 *
 * Stats are created by promoting a candidate (#189) — this page never creates one. The « → Trade »
 * column (#193) is the **only** way a trade comes into existence : one per stat, confirmed, and the
 * row shows a link to that trade from then on.
 */
@Component({
  selector: 'app-stats-page',
  imports: [
    DatePipe,
    DecimalPipe,
    NumberMaskDirective,
    PeriodFilter,
    RouterLink,
    StbButtonModule,
    StbButtonToggleModule,
    StbCheckboxModule,
    StbChipsModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbPaginatorModule,
    StbProgressSpinnerModule,
    StbSelectModule,
    StbSortHeaderModule,
    StbTableModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './stats-page.html',
  styleUrl: './stats-page.scss',
})
export class StatsPage {
  private readonly repo = inject(StatsRepository);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(StbToast);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  // ---- Data state ----
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly entries = signal<StatEntry[]>([]);
  readonly totalElements = signal(0);
  readonly summary = signal<StatSummary | null>(null);

  // ---- Pagination ----
  readonly pageIndex = signal(0);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly pageSizeOptions = [10, 25, 50, 100];

  // ---- Refetch nudge (a save / delete bumps it to re-fire the fetch effect) ----
  private readonly refetchTrigger = signal(0);

  // ---- Search (debounced 250 ms) ----
  private readonly searchInput$ = new Subject<string>();
  readonly searchTerm = toSignal(
    this.searchInput$.pipe(debounceTime(250), distinctUntilChanged()),
    {
      initialValue: '',
    },
  );
  readonly searchValue = signal('');

  // ---- Filters ----
  readonly period = signal<PeriodSelection>({ period: 'all', dateFrom: null, dateTo: null });
  readonly patterns = PATTERNS;
  readonly pattern = signal<Pattern | null>(null);
  readonly statusTabs = STATUS_TABS;
  readonly status = signal<StatStatus | null>(null);

  // ---- Sort ----
  readonly sort = signal<SortRequest>({ columnName: '', isAscending: true });

  readonly columns = [
    'tradeDate',
    'ticker',
    'pattern',
    'gap',
    'pmPush',
    'float',
    'volume',
    'locate',
    'openPrice',
    'pushOpen',
    'hod',
    'lod',
    'eod',
    'flags',
    'completed',
    'trade',
    'actions',
  ] as const;

  /** The day's rows with their derived percentages. */
  readonly rows = computed<StatRow[]>(() =>
    this.entries().map((e) => ({
      ...e,
      gap: gapPercent(e.previousClose, e.pmOpen),
      pmPush: pmPushPercent(e.pmOpen, e.pmHigh),
      pushOpenPercent: percentVsOpen(e.openPrice, e.pushOpenPrice),
      hodPercent: percentVsOpen(e.openPrice, e.hodPrice),
      lodPercent: percentVsOpen(e.openPrice, e.lodPrice),
      eodPercent: percentVsOpen(e.openPrice, e.eodPrice),
      missing: missingPrices(e),
    })),
  );

  // ---- Session panel ----
  /** The stat open in the panel — null = the panel is closed. */
  readonly completing = signal<StatEntry | null>(null);
  readonly session = signal<SessionModel>(BLANK_SESSION);
  /** True once a field of the open stat has been saved — the panel's « ✓ saved » cue. */
  readonly sessionSaved = signal(false);
  /** Rows the user closed — they stop auto-opening the panel for this visit. */
  private readonly dismissed = signal<ReadonlySet<string>>(new Set());
  /**
   * Every write goes through this queue, one at a time : a field left right before a click on ✓
   * must reach the server first, or the tick would be judged on the row without that price.
   */
  private readonly writes = new Subject<Observable<unknown>>();

  /** Premarket recap shown above the session inputs. */
  readonly completingRecap = computed(() => {
    const s = this.completing();
    if (!s) return null;
    return {
      gap: gapPercent(s.previousClose, s.pmOpen),
      pmPush: pmPushPercent(s.pmOpen, s.pmHigh),
    };
  });

  /** Live % vs the open for each session input, as the user types. */
  readonly sessionPercents = computed(() => {
    const m = this.session();
    return {
      pushOpen: percentVsOpen(m.openPrice, m.pushOpenPrice),
      hod: percentVsOpen(m.openPrice, m.hodPrice),
      lod: percentVsOpen(m.openPrice, m.lodPrice),
      eod: percentVsOpen(m.openPrice, m.eodPrice),
    };
  });

  readonly hodBelowLod = computed(() => {
    const { hodPrice, lodPrice } = this.session();
    return hodPrice !== null && lodPrice !== null && hodPrice < lodPrice;
  });

  /** Label keys of the prices the panel still misses. */
  readonly sessionMissing = computed(() => missingPrices(this.session()));
  readonly sessionFilled = computed(() => SESSION_PRICES.length - this.sessionMissing().length);
  readonly sessionPriceCount = SESSION_PRICES.length;

  constructor() {
    this.writes.pipe(concatMap((write) => write)).subscribe();

    effect(() => {
      const filterValue = this.currentFilter();
      const sort = this.sort();
      const pageIndex = this.pageIndex();
      const pageSize = this.pageSize();
      this.refetchTrigger();
      this.fetch(filterValue, {
        pageIndex,
        pageSize,
        sortField: sort.columnName || undefined,
        sortDirection: sort.columnName ? (sort.isAscending ? 'asc' : 'desc') : undefined,
      });
    });
  }

  // ---- Filter handlers ----

  onSearchInput(value: string): void {
    this.searchValue.set(value);
    this.searchInput$.next(value);
    this.pageIndex.set(0);
  }

  clearSearch(): void {
    this.searchValue.set('');
    this.searchInput$.next('');
    this.pageIndex.set(0);
  }

  setPeriod(selection: PeriodSelection): void {
    this.period.set(selection);
    this.pageIndex.set(0);
  }

  setPattern(pattern: Pattern | null): void {
    this.pattern.set(pattern);
    this.pageIndex.set(0);
  }

  setStatus(status: StatStatus | null): void {
    this.status.set(status);
    this.pageIndex.set(0);
  }

  onSortChange(sort: Sort): void {
    this.sort.set({
      columnName: sort.direction ? sort.active : '',
      isAscending: sort.direction === 'asc',
    });
    this.pageIndex.set(0);
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  // ---- Session panel ----

  open(entry: StatEntry): void {
    this.completing.set(entry);
    this.session.set(sessionOf(entry));
    this.sessionSaved.set(false);
  }

  setSessionPrice(field: SessionPrice, value: number | null): void {
    this.session.update((m) => ({ ...m, [field]: value }));
  }

  toggleFlag(field: 'ssr' | 'under1Dollar' | 'entryAfter11am', value: boolean): void {
    this.session.update((m) => ({ ...m, [field]: value }));
    this.saveSession();
  }

  /**
   * Saves the panel's session when a field is left — the whole row goes back, as the backend
   * expects. Nothing is sent when nothing changed or while the HOD sits under the LOD (the hint
   * says so) ; a ticked stat losing a price is refused here, before the backend's 400.
   */
  saveSession(): void {
    const entry = this.completing();
    if (!entry) return;
    const session = this.session();
    if (sameSession(session, sessionOf(entry)) || this.hodBelowLod()) return;
    if (entry.completed && missingPrices(session).length > 0) {
      this.toasts.error(
        this.translate.instant('stats.snackbar.untickFirst', { ticker: entry.ticker }),
      );
      this.session.set(sessionOf(entry));
      return;
    }
    // Patched right away : the next field left starts from this one, not from the server's reply.
    this.patchRow({ ...entry, ...session });
    this.enqueue(
      this.repo.update(entry.id, this.toInput(entry, session)).pipe(
        tap((saved) => {
          this.patchRow(saved);
          this.sessionSaved.set(true);
          // The KPIs only count ticked stats : editing one of them moves them.
          if (saved.completed) this.refreshSummary();
        }),
        catchError(() => {
          this.patchRow(entry);
          if (this.completing()?.id === entry.id) this.session.set(sessionOf(entry));
          this.toasts.error(
            this.translate.instant('stats.snackbar.sessionSaveError', { ticker: entry.ticker }),
          );
          return EMPTY;
        }),
      ),
    );
  }

  /** « Close » — the field being typed is saved on the way out, then the panel stops re-opening. */
  close(): void {
    const current = this.completing();
    if (!current) return;
    this.saveSession();
    this.dismissed.update((set) => new Set(set).add(current.id));
    this.completing.set(null);
  }

  /**
   * The ✓ — ticks the stat as completed, or unticks it back to "to complete". Ticking needs the five
   * prices : the button is disabled without them, and the backend refuses it too. The list reloads,
   * since the status filter and the KPIs both depend on it.
   */
  toggleCompleted(entry: StatEntry): void {
    const completed = !entry.completed;
    if (completed && missingPrices(entry).length > 0) return;
    this.enqueue(
      this.repo.setCompleted(entry.id, completed).pipe(
        tap((saved) => {
          this.patchRow(saved);
          this.refetch();
        }),
        catchError(() => {
          this.toasts.error(
            this.translate.instant('stats.snackbar.completionError', { ticker: entry.ticker }),
          );
          return EMPTY;
        }),
      ),
    );
  }

  /** « Il manque HOD, EOD » — the ✓'s tooltip while it can't tick. */
  missingLabel(entry: Pick<SessionModel, SessionPrice>): string {
    const fields = missingPrices(entry).map((key) => this.translate.instant(key));
    return this.translate.instant('stats.completion.missing', { fields: fields.join(', ') });
  }

  // ---- Row actions ----

  /**
   * « → Trade » (#193) — confirmed, then the backend creates the trade and we land straight on its
   * page : the point of the action is to go and type the executions. One trade per stat, so the
   * button is gone from that row on the way back.
   */
  promoteToTrade(entry: StatEntry): void {
    this.confirm
      .ask('stats.confirmPromoteTrade', { params: { ticker: entry.ticker } })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.promoteToTrade(entry.id)),
        tap((trade) => {
          this.toasts.success(
            this.translate.instant('stats.snackbar.promoteTradeSuccess', { ticker: entry.ticker }),
          );
          void this.router.navigate(['/journal', trade.id]);
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('stats.snackbar.promoteTradeError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  delete(entry: StatEntry): void {
    this.confirm
      .ask('stats.confirmDelete', { params: { ticker: entry.ticker }, variant: 'danger' })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.delete(entry.id)),
        tap(() => {
          this.toasts.success(
            this.translate.instant('stats.snackbar.deleteSuccess', { ticker: entry.ticker }),
          );
          if (this.completing()?.id === entry.id) this.completing.set(null);
          // Deleting the last row of a non-zero page would strand the user on an empty page.
          if (this.entries().length === 1 && this.pageIndex() > 0) {
            this.pageIndex.update((n) => n - 1);
          } else {
            this.refetch();
          }
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('stats.snackbar.deleteError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  // ---- Internals ----

  private currentFilter(): StatEntryFilter {
    const range = this.period();
    return {
      query: this.searchTerm() || null,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      pattern: this.pattern(),
      status: this.status(),
    };
  }

  private fetch(
    filterValue: StatEntryFilter,
    page: {
      pageIndex: number;
      pageSize: number;
      sortField?: string;
      sortDirection?: 'asc' | 'desc';
    },
  ): void {
    this.loading.set(true);
    this.error.set(null);
    this.repo.findAll(filterValue, page).subscribe({
      next: (result) => {
        this.entries.set(result.content);
        this.totalElements.set(result.totalElements);
        this.loading.set(false);
        this.autoOpenPending(result.content);
      },
      error: () => {
        this.entries.set([]);
        this.error.set(this.translate.instant('stats.errors.load'));
        this.loading.set(false);
      },
    });
    this.repo.summary(filterValue).subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => this.summary.set(null),
    });
  }

  /**
   * Opens the session panel on the first stat of the page still to complete. Stats closed during
   * this visit are skipped, and an open panel is never replaced.
   */
  private autoOpenPending(rows: StatEntry[]): void {
    if (this.completing()) return;
    const pending = rows.find((s) => !s.completed && !this.dismissed().has(s.id));
    if (pending) this.open(pending);
  }

  private enqueue(write: Observable<unknown>): void {
    this.writes.next(write);
  }

  /** Replaces a row of the page — and the panel's stat when it is that one — with [entry]. */
  private patchRow(entry: StatEntry): void {
    this.entries.update((list) => list.map((s) => (s.id === entry.id ? entry : s)));
    if (this.completing()?.id === entry.id) this.completing.set(entry);
  }

  private refreshSummary(): void {
    this.repo.summary(this.currentFilter()).subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => this.summary.set(null),
    });
  }

  private refetch(): void {
    this.refetchTrigger.update((n) => n + 1);
  }

  /** The session panel sends the whole row back — premarket untouched, session + flags updated. */
  private toInput(entry: StatEntry, session: SessionModel): StatEntryInput {
    return {
      tradeDate: entry.tradeDate,
      pattern: entry.pattern,
      ticker: entry.ticker,
      previousClose: entry.previousClose,
      pmOpen: entry.pmOpen,
      pmHigh: entry.pmHigh,
      floatMillions: entry.floatMillions,
      volumeMillions: entry.volumeMillions,
      locatePerShare: entry.locatePerShare,
      note: entry.note,
      ...session,
    };
  }
}

function isPositive(n: number | null): boolean {
  return n !== null && n > 0;
}

function sameSession(a: SessionModel, b: SessionModel): boolean {
  return (Object.keys(a) as (keyof SessionModel)[]).every((key) => a[key] === b[key]);
}
