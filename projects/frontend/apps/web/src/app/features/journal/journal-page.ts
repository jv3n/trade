import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { Router, RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  EMPTY,
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
  PageEvent,
  Sort,
  StbButtonModule,
  StbButtonToggleModule,
  StbChipsModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbPaginatorModule,
  StbProgressSpinnerModule,
  StbSortHeaderModule,
  StbTableModule,
  StbToast,
  StbTooltipModule,
} from '@portfolioai/ui';
import { JournalRepository, PageRequest } from '../../core/api/journal/journal.repository';
import {
  JournalSummary,
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
 * The three filter axes of the toolbar (#195) : a period, one pattern at a time, and the outcome.
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
  };
}

const DEFAULT_PAGE_SIZE = 10;

/**
 * Trading journal landing page — table of every trade for the current user, plus :
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
 *   - **Open / delete** : a row opens the trade page, where everything is edited in place (#194) ;
 *     delete goes through the confirmation modal (`ConfirmService`). There is no « add » here since
 *     #193 — a trade is born from a stat, on the stats sheet. A delete refetches the current page
 *     rather than splicing locally.
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
    StbProgressSpinnerModule,
    StbSortHeaderModule,
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

  // ---- Data state ----
  readonly loading = signal(true);
  // A superseded request is dropped, or the slower of two quick filter changes wins (#370).
  private listing?: Subscription;
  private summaryFetch?: Subscription;
  private statSummaryFetch?: Subscription;
  readonly error = signal<string | null>(null);
  readonly entries = signal<TradeEntry[]>([]);
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

  readonly columns = [
    'tradeDate',
    'ticker',
    'pattern',
    'size',
    'openPrice',
    'exitPrice',
    'retainedProfitDollars',
    'retainedGainPercent',
    'actions',
  ] as const;

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

  clearSearch(): void {
    this.searchValue.set('');
    this.searchInput$.next('');
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
  // No create here (#193) : a trade is born from a stat, through the « → Trade » action of the
  // stats sheet. No edit either (#194) : the trade page owns the edition. The journal only opens
  // and deletes.

  /** Row click → dedicated detail view. The ticker chip + action buttons stop propagation. */
  openDetail(entry: TradeEntry): void {
    void this.router.navigate(['/journal', entry.id]);
  }

  delete(entry: TradeEntry): void {
    // Decided BEFORE the request : if we're about to delete the **last row** of a non-zero
    // page, we should backstep one page after the delete. Computing this from the current
    // signals (entries + pageIndex) once confirmed is safe — they reflect the state the user
    // is staring at.
    let willEmptyPage = false;

    this.confirm
      .ask('journal.confirmDelete', { params: { ticker: entry.ticker }, variant: 'danger' })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          willEmptyPage = this.entries().length === 1 && this.pageIndex() > 0;
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
    this.listing = this.repo.findAll(filter, page).subscribe({
      next: (result) => {
        this.entries.set(result.content);
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
