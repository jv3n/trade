import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { Router, RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  EMPTY,
  Observable,
  Subject,
  Subscription,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  switchMap,
  tap,
} from 'rxjs';

import {
  MatDialog,
  PageEvent,
  Sort,
  StbButtonModule,
  StbButtonToggleModule,
  StbChipsModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbPaginatorModule,
  StbSkeletonKpiRow,
  StbSkeletonTable,
  StbSortHeaderModule,
  StbTableModule,
  StbToast,
  StbTooltipModule,
  stbLoadGate,
} from '@portfolioai/ui';
import { JournalRepository, PageRequest } from '../../core/api/journal/journal.repository';
import {
  ENTRY_TIMINGS,
  EntryTiming,
  JournalDay,
  JournalSummary,
  NewTradeInput,
  TradeEntry,
  TradeEntryFilter,
  TradeStatus,
} from '../../core/api/journal/trade-entry.model';
import { PATTERNS, Pattern } from '../../core/api/shared/pattern.model';
import { StatSummary } from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { PeriodFilter } from '../../shared/period-filter/period-filter';
import {
  PeriodPresetKey,
  PeriodSelection,
  computePeriodRange,
} from '../../shared/period-preset/period-preset';
import { PluralPipe } from '../../shared/plural/plural';
import { PricePipe } from '../../shared/price/price.pipe';
import {
  skeletonHeaderKeys,
  toSkeletonColumns,
  type SkeletonColumnDefs,
} from '../../shared/skeleton-columns/skeleton-columns';
import { NewTradeDialog } from './new-trade-dialog/new-trade-dialog';

/**
 * Sort state for the journal table — same shape as ic3's `IcSortRequest` :
 *   - `columnName` empty  → no user sort, backend falls back to its DEFAULT_SORT.
 *   - `columnName` set    → sort by this column ; `isAscending` picks the direction.
 *
 * Bound back into MatSort via `[matSortActive]` + `[matSortDirection]` in the template so
 * the visible arrow always tracks the actual sort applied server-side.
 */
interface SortRequest {
  columnName: string;
  isAscending: boolean;
}

/**
 * The filter axes of the toolbar (#195) : a period, one pattern at a time, the outcome, and the
 * entry time (#651).
 * They apply as soon as they are clicked — there is no « Apply » step anymore, the toolbar *is*
 * the filter. The period comes from the shared [PeriodFilter] (preset, or a custom range).
 */
interface FilterFormModel {
  period: PeriodPresetKey;
  dateFrom: Date | null;
  dateTo: Date | null;
  pattern: Pattern | null;
  /** Outcome segment — only PROFITABLE / LOSING are reachable from the toolbar. */
  status: TradeStatus | null;
  /** Entered before or after 11 am (#651) — null : any, untimed trades included. */
  entry: EntryTiming | null;
}

/** The journal opens on the running month, the way the KPI row reads it ("P&L September"). */
function defaultFilter(): FilterFormModel {
  const range = computePeriodRange('thisMonth');
  return {
    period: 'thisMonth',
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    pattern: null,
    status: null,
    entry: null,
  };
}

const DEFAULT_PAGE_SIZE = 10;

/** A row's identity — one ticker on one day (#500). */
function dayKey(day: JournalDay): string {
  return `${day.tradeDate.toDateString()}|${day.ticker}`;
}

/** The listing's columns as its skeleton shows them (#539). */
const SKELETON_COLUMNS: SkeletonColumnDefs = {
  // The chevron of a day with several trades — `$icon-lg`.
  expand: { variant: 'blank', width: '24px' },
  tradeDate: { key: 'journal.fields.tradeDate' },
  ticker: { key: 'journal.fields.ticker', variant: 'ticker' },
  patterns: { key: 'journal.fields.pattern' },
  directions: { key: 'journal.fields.direction' },
  tradeCount: { key: 'journal.fields.tradeCount', variant: 'numeric' },
  maxSize: { key: 'journal.fields.maxSize', variant: 'numeric' },
  openPrice: { key: 'journal.fields.openPrice', variant: 'numeric' },
  exitPrice: { key: 'journal.fields.exitPrice', variant: 'numeric' },
  durationMinutes: { key: 'journal.fields.cumulatedDuration', variant: 'numeric' },
  retainedProfitDollars: { key: 'journal.fields.retainedProfitDollars', variant: 'numeric' },
  retainedGainPercent: { key: 'journal.fields.gainPercent', variant: 'numeric' },
  actions: { variant: 'actions' },
};

/**
 * Trading journal landing page — one row per ticker and day (#500), its trades read by opening it,
 * plus :
 *   - **Search** : ticker LIKE %q% via the backend `?q=…` query param (debounced 250 ms).
 *   - **Server-side sort** : MatSort emits `(active, direction)` → forwarded as Spring's
 *     `?sort=field,direction`. Sorting a column always queries page 0 so we don't strand the
 *     user on a page index that doesn't exist for the new sort.
 *   - **KPIs** (#195) : realized P&L over the filtered period, win rate, average win / loss with
 *     the profit factor, and how many stats of that period were traded — all computed on the
 *     **whole filtered set**, not the visible page. The first three come from
 *     `GET /api/journal/trades/summary`, the last one from the stats sheet's own summary.
 *   - **Filters** : an inline toolbar — period preset (+ an explicit range on « custom »),
 *     pattern, and outcome (all / winners / losers). They apply on click and refetch.
 *   - **Pagination** : `<mat-paginator>` below the table. Default 10 rows per page. Filter /
 *     search / sort changes reset the index to 0.
 *   - **Open / delete** : a single-trade row opens the trade page, where everything is edited in
 *     place (#194) ; a row of several opens onto its trades, each opening its page. Delete is per
 *     trade, through the confirmation modal (`ConfirmService`). A delete refetches the current page
 *     rather than splicing locally.
 *   - **« + Trade »** (#634) : a trade on its own, with no stat behind it — the « Nouveau trade »
 *     dialog is the confirmation, and the new trade opens on its sheet.
 *
 * One effect watches (`searchTerm`, `appliedFilter`, `sort`, `pageIndex`, `pageSize`) and
 * refetches when any of them changes.
 */
@Component({
  selector: 'app-journal-page',

  imports: [
    DatePipe,
    DecimalPipe,
    PricePipe,
    RouterLink,
    StbButtonModule,
    StbButtonToggleModule,
    StbChipsModule,
    PeriodFilter,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbPaginatorModule,
    StbSortHeaderModule,
    StbSkeletonTable,
    StbSkeletonKpiRow,
    StbTableModule,
    StbTooltipModule,
    PluralPipe,
    TranslatePipe,
  ],
  templateUrl: './journal-page.html',
  styleUrl: './journal-page.scss',
})
export class JournalPage {
  private readonly repo = inject(JournalRepository);
  private readonly statsRepo = inject(StatsRepository);
  private readonly confirm = inject(ConfirmService);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(StbToast);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  // ---- Data state ----
  readonly loading = signal(true);
  // A superseded request is dropped, or the slower of two quick filter changes wins (#370).
  private listing?: Subscription;
  private summaryFetch?: Subscription;
  private statSummaryFetch?: Subscription;
  readonly error = signal<string | null>(null);
  readonly days = signal<JournalDay[]>([]);
  /** The multi-trade rows opened onto their trades. */
  readonly expanded = signal<ReadonlySet<string>>(new Set());
  readonly totalElements = signal(0);

  // ---- Pagination ----
  readonly pageIndex = signal(0);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly pageSizeOptions = [10, 25, 50, 100];

  // ---- Refetch nudge ----
  // The CRUD ops (create / update / delete) bump this counter to force the fetch effect to
  // re-fire even when no other dependency (search, filter, sort, page) has changed. Using
  // a dedicated signal avoids the `distinctUntilChanged` of the search pipe swallowing the
  // refresh request when the search hasn't changed.
  private readonly refetchTrigger = signal(0);

  // ---- Search (debounced 250 ms before the backend call) ----
  private readonly searchInput$ = new Subject<string>();
  readonly searchTerm = toSignal(
    this.searchInput$.pipe(debounceTime(250), distinctUntilChanged()),
    { initialValue: '' },
  );
  readonly searchValue = signal('');

  // ---- Filters (applied on click — the toolbar is the filter) ----
  readonly appliedFilter = signal<FilterFormModel>(defaultFilter());

  // ---- KPIs over the filtered set ----
  readonly summary = signal<JournalSummary | null>(null);
  /** « 8 / 10 stats traded » — the stats sheet's own count over the same period. */
  readonly statSummary = signal<StatSummary | null>(null);
  readonly statCount = computed(() => {
    const s = this.statSummary();
    return s === null ? null : s.traded + s.untraded;
  });

  // ---- Sort (server-side, controlled-component pattern) ----
  // The `sort` signal is the **source of truth** for the table's sort state. It's bound back
  // into MatSort via `[matSortActive]` + `[matSortDirection]` in the template, so a) the
  // arrow always reflects what the server returned, b) MatSort doesn't end up in a stale
  // internal state divergent from the data. Empty `columnName` = no user sort (server falls
  // back to its DEFAULT_SORT).
  readonly sort = signal<SortRequest>({ columnName: '', isAscending: true });

  // ---- Constants for the template ----
  readonly patterns = PATTERNS;
  readonly entryTimings = ENTRY_TIMINGS;

  readonly columns = [
    'expand',
    'tradeDate',
    'ticker',
    'patterns',
    'directions',
    'tradeCount',
    'maxSize',
    'openPrice',
    'exitPrice',
    'durationMinutes',
    'retainedProfitDollars',
    'retainedGainPercent',
    'actions',
  ] as const;
  readonly detailColumns = ['detail'] as const;

  /** First load only (#539) : a refetch dims the table instead. */
  readonly gate = stbLoadGate(this.loading);
  private readonly headerLabels = toSignal(
    this.translate.stream(skeletonHeaderKeys(SKELETON_COLUMNS)) as Observable<
      Record<string, string>
    >,
    { initialValue: {} },
  );
  readonly skeletonColumns = computed(() =>
    toSkeletonColumns(this.columns, SKELETON_COLUMNS, this.headerLabels()),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.listing?.unsubscribe();
      this.summaryFetch?.unsubscribe();
      this.statSummaryFetch?.unsubscribe();
    });
    effect(() => {
      const q = this.searchTerm();
      const f = this.appliedFilter();
      const sort = this.sort();
      const pageIndex = this.pageIndex();
      const pageSize = this.pageSize();
      this.refetchTrigger(); // read so the effect re-fires when the CRUD path bumps it
      const criteria: TradeEntryFilter = {
        query: q || null,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
        patterns: f.pattern ? [f.pattern] : null,
        status: f.status,
        entry: f.entry,
      };
      this.fetchSummaries(criteria);
      this.fetch(criteria, {
        pageIndex,
        pageSize,
        sortField: sort.columnName || undefined,
        sortDirection: sort.columnName ? (sort.isAscending ? 'asc' : 'desc') : undefined,
      });
    });
  }

  // ---- Search handlers ----
  onSearchInput(value: string): void {
    this.searchValue.set(value);
    this.searchInput$.next(value);
    this.pageIndex.set(0);
  }

  // ---- Filter handlers — every one of them applies straight away and rewinds to page 0 ----

  setPeriod({ period, dateFrom, dateTo }: PeriodSelection): void {
    this.patchFilter({ period, dateFrom, dateTo });
  }

  setPattern(p: Pattern | null): void {
    this.patchFilter({ pattern: p });
  }

  setStatus(s: TradeStatus | null): void {
    this.patchFilter({ status: s });
  }

  setEntry(entry: EntryTiming | null): void {
    this.patchFilter({ entry });
  }

  private patchFilter(change: Partial<FilterFormModel>): void {
    this.appliedFilter.update((f) => ({ ...f, ...change }));
    this.pageIndex.set(0);
  }

  // ---- Sort handler ----
  // Normalises Material's `Sort` event into the lib's `SortRequest` shape : an empty
  // direction (3rd click, cleared) maps to an empty columnName so the effect knows "no user
  // sort" and the backend falls back to its DEFAULT_SORT.
  onSortChange(s: Sort): void {
    this.sort.set({
      columnName: s.direction !== '' ? s.active : '',
      isAscending: s.direction === 'asc',
    });
    this.pageIndex.set(0);
  }

  // ---- Pagination handler ----
  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  // ---- CRUD ----
  // No edit here (#194) : the trade page owns the edition.

  /** « + Trade » : a trade on its own (#634) — a trade studied first is born from its stat. */
  openNewTrade(): void {
    this.dialog
      .open<NewTradeDialog, void, NewTradeInput | undefined>(NewTradeDialog, {
        width: '480px',
        maxWidth: '95vw',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .pipe(
        filter((input): input is NewTradeInput => !!input),
        switchMap((input) =>
          this.repo.create(input).pipe(
            tap((created) => {
              this.toasts.success(
                this.translate.instant('journal.snackbar.createSuccess', {
                  ticker: created.ticker,
                }),
              );
              this.openDetail(created);
            }),
            catchError(() => {
              this.toasts.error(this.translate.instant('journal.snackbar.createError'));
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }

  /**
   * Row click : a single-trade row goes straight to its sheet — the common case stays one click ; a
   * row holding several opens onto them, or closes back.
   */
  openRow(day: JournalDay): void {
    if (day.tradeCount === 1) {
      this.openDetail(day.trades[0]);
      return;
    }
    const key = dayKey(day);
    this.expanded.update((open) => {
      const next = new Set(open);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  isExpanded(day: JournalDay): boolean {
    return this.expanded().has(dayKey(day));
  }

  /**
   * `when` of the detail row : every row of several trades has one, empty while closed. mat-table
   * only evaluates `when` as the data renders, so opening a row must not depend on it.
   */
  readonly hasTrades = (_index: number, day: JournalDay): boolean => day.tradeCount > 1;

  openDetail(entry: TradeEntry): void {
    void this.router.navigate(['/journal', entry.id]);
  }

  /**
   * Trades of the row with no retained P&L yet (#515) — the row's sum then covers only part of the
   * day. Kept rather than blanked : a day's realised P&L is worth more than its open position.
   */
  missingPnl(day: JournalDay): number {
    return day.trades.filter((t) => t.retainedProfitDollars === null).length;
  }

  /** Trades of the row with no duration — their fill times are missing, the sum leaves them out. */
  missingDuration(day: JournalDay): number {
    return day.trades.filter((t) => t.durationMinutes === null).length;
  }

  /** « 20 min », « 3 h 34 » — the durations of the rows and of their trades. */
  durationLabel(minutes: number | null): string {
    if (minutes === null) return '—';
    if (minutes < 60) return this.translate.instant('journal.duration.minutes', { minutes });
    return this.translate.instant('journal.duration.hours', {
      hours: Math.floor(minutes / 60),
      minutes: String(minutes % 60).padStart(2, '0'),
    });
  }

  /**
   * Deletes one trade. A trade among several of its day says the others stay, and that the balance
   * moves by this trade's P&L alone (#500).
   */
  delete(entry: TradeEntry, day: JournalDay): void {
    // Decided BEFORE the request : deleting the last trade of the **last row** of a non-zero page
    // should backstep one page afterwards.
    let willEmptyPage = false;
    const key =
      day.tradeCount > 1
        ? 'journal.confirmDeleteOne'
        : entry.statEntryId
          ? 'journal.confirmDelete'
          : 'journal.confirmDeleteAlone';

    this.confirm
      .ask(key, {
        params: { ticker: entry.ticker, others: day.tradeCount - 1 },
        variant: 'danger',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          willEmptyPage = this.days().length === 1 && day.tradeCount === 1 && this.pageIndex() > 0;
          return this.repo.delete(entry.id);
        }),
        tap(() => {
          this.toasts.success(
            this.translate.instant('journal.snackbar.deleteSuccess', { ticker: entry.ticker }),
          );
          if (willEmptyPage) {
            // Decrementing pageIndex triggers the effect — no need to bump `refetchTrigger`,
            // the page change is enough to re-fire the fetch on the previous (existing) page.
            this.pageIndex.update((n) => n - 1);
          } else {
            // Refetch the current page — local splicing would leave us with N-1 rows on the
            // page and the total count out of sync ; trust the server for both.
            this.refetch();
          }
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('journal.snackbar.deleteError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /**
   * Re-runs the fetch effect without touching any user-facing state. Bumping a dedicated
   * counter sidesteps the search pipe's `distinctUntilChanged` (which would swallow a "push
   * the same value" trick if the search hasn't moved) and any signal-identity short-circuit
   * on the other deps.
   */
  private refetch(): void {
    this.refetchTrigger.update((n) => n + 1);
  }

  /**
   * KPI row — two independent calls, each over the same filtered set as the listing. A failing
   * summary leaves its cards empty rather than taking the page down : the table is what the user
   * came for. The stats count only cares about the period (a pattern or an outcome filter would
   * make « traded / all » compare two different sets).
   */
  private fetchSummaries(criteria: TradeEntryFilter): void {
    this.summaryFetch?.unsubscribe();
    this.summaryFetch = this.repo.summary(criteria).subscribe({
      next: (s) => this.summary.set(s),
      error: () => this.summary.set(null),
    });
    this.statSummaryFetch?.unsubscribe();
    this.statSummaryFetch = this.statsRepo
      .summary({ dateFrom: criteria.dateFrom, dateTo: criteria.dateTo })
      .subscribe({
        next: (s) => this.statSummary.set(s),
        error: () => this.statSummary.set(null),
      });
  }

  private fetch(filter: TradeEntryFilter, page: PageRequest): void {
    this.listing?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.listing = this.repo.findDays(filter, page).subscribe({
      next: (result) => {
        this.days.set(result.content);
        this.totalElements.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('journal.errors.load'));
        this.loading.set(false);
      },
    });
  }
}
