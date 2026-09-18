import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { MatDialog } from '@angular/material/dialog';

import { PageEvent } from '@angular/material/paginator';
import { MatSidenav } from '@angular/material/sidenav';
import { Sort } from '@angular/material/sort';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { MatSnackBar } from '@angular/material/snack-bar';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { StbDatePickerModule } from '@portfolioai/ui';
import { parseISO } from 'date-fns';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  switchMap,
  tap,
} from 'rxjs';

import {
  StbButtonModule,
  StbChipsModule,
  StbDividerModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbPaginatorModule,
  StbProgressSpinnerModule,
  StbSelectModule,
  StbSidenavModule,
  StbSortHeaderModule,
  StbTableModule,
  StbTooltipModule,
} from '@portfolioai/ui';
import { JournalRepository, PageRequest } from '../../core/api/journal/journal.repository';
import {
  TRADE_PATTERNS,
  TRADE_PLAYS,
  TRADE_STATUSES,
  TradeEntry,
  TradeEntryFilter,
  TradeEntryInput,
  TradePattern,
  TradePlay,
  TradeStatus,
} from '../../core/api/journal/trade-entry.model';
import {
  PERIOD_PRESETS,
  PeriodPresetKey,
  computePeriodRange,
} from '../../shared/period-preset/period-preset';
import {
  AddTradeDialog,
  AddTradeDialogData,
  AddTradeSeed,
} from './add-trade-dialog/add-trade-dialog';

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

interface FilterFormModel {
  period: PeriodPresetKey;
  dateFrom: Date | null;
  dateTo: Date | null;
  plays: TradePlay[];
  patterns: TradePattern[];
  status: TradeStatus | null;
}

const EMPTY_FILTER: FilterFormModel = {
  period: 'all',
  dateFrom: null,
  dateTo: null,
  plays: [],
  patterns: [],
  status: null,
};

const DEFAULT_PAGE_SIZE = 10;

/**
 * Trading journal landing page — table of every trade for the current user, plus :
 *   - **Search** : ticker LIKE %q% via the backend `?q=…` query param (debounced 250 ms).
 *   - **Server-side sort** : MatSort emits `(active, direction)` → forwarded as Spring's
 *     `?sort=field,direction`. Sorting a column always queries page 0 so we don't strand the
 *     user on a page index that doesn't exist for the new sort.
 *   - **Filters** : right-side `<mat-sidenav>` with period presets (this month / last quarter
 *     / etc.), explicit date range, play / pattern multi-selects, status (open / closed /
 *     profitable / losing). Filter changes refetch from the backend.
 *   - **Pagination** : `<mat-paginator>` below the table. Default 10 rows per page. Filter /
 *     search / sort changes reset the index to 0.
 *   - **CRUD** : add / edit via Material dialog, delete via native confirm(). Every mutation
 *     refetches the current page (a created trade may not land on the current page given the
 *     active filter + sort, so we don't try to splice the result locally).
 *
 * One effect watches (`searchTerm`, `appliedFilter`, `sort`, `pageIndex`, `pageSize`) and
 * refetches when any of them changes.
 */
@Component({
  selector: 'app-journal-page',

  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    StbButtonModule,
    StbChipsModule,
    StbDatePickerModule,
    StbDividerModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbPaginatorModule,
    StbProgressSpinnerModule,
    StbSelectModule,
    StbSidenavModule,
    StbSortHeaderModule,
    StbTableModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './journal-page.html',
  styleUrl: './journal-page.scss',
})
export class JournalPage {
  private readonly repo = inject(JournalRepository);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // ---- Data state ----
  readonly loading = signal(true);
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

  // ---- Filter drawer ----
  readonly drawer = viewChild.required<MatSidenav>('filterDrawer');
  /** Working copy edited inside the drawer — not applied until the user clicks « Apply ». */
  readonly filterModel = signal<FilterFormModel>(EMPTY_FILTER);
  /** Applied filter — what actually drives the backend query. */
  readonly appliedFilter = signal<FilterFormModel>(EMPTY_FILTER);
  readonly activeFilterCount = computed(() => {
    const f = this.appliedFilter();
    let n = 0;
    if (f.dateFrom || f.dateTo) n += 1;
    if (f.plays.length > 0) n += 1;
    if (f.patterns.length > 0) n += 1;
    if (f.status) n += 1;
    return n;
  });

  // ---- Sort (server-side, controlled-component pattern à la ic3) ----
  // The `sort` signal is the **source of truth** for the table's sort state. It's bound back
  // into MatSort via `[matSortActive]` + `[matSortDirection]` in the template, so a) the
  // arrow always reflects what the server returned, b) MatSort doesn't end up in a stale
  // internal state divergent from the data. Empty `columnName` = no user sort (server falls
  // back to its DEFAULT_SORT).
  readonly sort = signal<SortRequest>({ columnName: '', isAscending: true });

  // ---- Constants for the template ----
  readonly periods = PERIOD_PRESETS;
  readonly plays = TRADE_PLAYS;
  readonly patterns = TRADE_PATTERNS;
  readonly statuses = TRADE_STATUSES;

  readonly columns = [
    'tradeDate',
    'ticker',
    'play',
    'pattern',
    'size',
    'openPrice',
    'exitPrice',
    'profitDollars',
    'gainPercent',
    'link',
    'actions',
  ] as const;

  constructor() {
    effect(() => {
      const q = this.searchTerm();
      const f = this.appliedFilter();
      const sort = this.sort();
      const pageIndex = this.pageIndex();
      const pageSize = this.pageSize();
      this.refetchTrigger(); // read so the effect re-fires when the CRUD path bumps it
      this.fetch(
        {
          query: q || null,
          dateFrom: f.dateFrom,
          dateTo: f.dateTo,
          plays: f.plays.length > 0 ? f.plays : null,
          patterns: f.patterns.length > 0 ? f.patterns : null,
          status: f.status,
        },
        {
          pageIndex,
          pageSize,
          sortField: sort.columnName || undefined,
          sortDirection: sort.columnName ? (sort.isAscending ? 'asc' : 'desc') : undefined,
        },
      );
    });

    this.handleCreateFromStat();
  }

  /**
   * Deep-link from the stats page : `?ticker=…&date=YYYY-MM-DD&statId=…` opens the add-trade
   * dialog pre-filled (ticker + date) and pre-linked to the stat (`statId` → `statEntryId`). The
   * params are stripped right away (replaceUrl) so a refresh / back-nav doesn't reopen the dialog.
   */
  private handleCreateFromStat(): void {
    const params = this.route.snapshot.queryParamMap;
    const ticker = params.get('ticker');
    if (!ticker) return;

    const date = params.get('date');
    const seed: AddTradeSeed = {
      ticker,
      tradeDate: date ? parseISO(date) : new Date(),
      statEntryId: params.get('statId'),
    };

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });

    this.openDialog(null, seed);
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

  // ---- Drawer + filter handlers ----
  toggleDrawer(): void {
    void this.drawer().toggle();
  }

  applyFilters(): void {
    this.appliedFilter.set({ ...this.filterModel() });
    this.pageIndex.set(0);
    void this.drawer().close();
  }

  resetFilters(): void {
    this.filterModel.set({ ...EMPTY_FILTER });
    this.appliedFilter.set({ ...EMPTY_FILTER });
    this.pageIndex.set(0);
  }

  /** Picking a preset populates dateFrom / dateTo via `date-fns` helpers. */
  onPeriodChange(key: PeriodPresetKey): void {
    if (key === 'custom') {
      this.filterModel.update((m) => ({ ...m, period: 'custom' }));
      return;
    }
    const range = computePeriodRange(key);
    this.filterModel.update((m) => ({
      ...m,
      period: key,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
    }));
  }

  togglePlay(p: TradePlay, checked: boolean): void {
    this.filterModel.update((m) => ({
      ...m,
      plays: checked ? [...m.plays, p] : m.plays.filter((x) => x !== p),
    }));
  }

  togglePattern(p: TradePattern, checked: boolean): void {
    this.filterModel.update((m) => ({
      ...m,
      patterns: checked ? [...m.patterns, p] : m.patterns.filter((x) => x !== p),
    }));
  }

  setStatus(s: TradeStatus | null): void {
    this.filterModel.update((m) => ({ ...m, status: s }));
  }

  setDateFrom(d: Date | null): void {
    this.filterModel.update((m) => ({ ...m, period: 'custom', dateFrom: d }));
  }

  setDateTo(d: Date | null): void {
    this.filterModel.update((m) => ({ ...m, period: 'custom', dateTo: d }));
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
  openCreate(): void {
    this.openDialog(null);
  }

  openEdit(entry: TradeEntry): void {
    this.openDialog(entry);
  }

  /** Row click → dedicated detail view. The ticker chip + action buttons stop propagation. */
  openDetail(entry: TradeEntry): void {
    void this.router.navigate(['/journal', entry.id]);
  }

  delete(entry: TradeEntry): void {
    const confirmMsg = this.translate.instant('journal.confirmDelete', { ticker: entry.ticker });
    if (!confirm(confirmMsg)) return;

    // Decide BEFORE the request : if we're about to delete the **last row** of a non-zero
    // page, we should backstep one page after the delete. Computing this from the current
    // signals (entries + pageIndex) is safe — they reflect the state the user is staring at.
    const willEmptyPage = this.entries().length === 1 && this.pageIndex() > 0;

    this.repo
      .delete(entry.id)
      .pipe(
        tap(() => {
          this.toast('journal.snackbar.deleteSuccess', 'success', { ticker: entry.ticker });
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
          this.toast('journal.snackbar.deleteError', 'error');
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

  private fetch(filter: TradeEntryFilter, page: PageRequest): void {
    this.loading.set(true);
    this.error.set(null);
    this.repo.findAll(filter, page).subscribe({
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

  /**
   * Dialog → save pipeline. The afterClosed() stream emits one value (the dialog result), then
   * completes ; `switchMap` chains into the right CRUD call. `tap` posts the success
   * snackbar + refetches ; `catchError` swallows the error after the user-facing toast so the
   * outer subscription completes cleanly.
   */
  private openDialog(entry: TradeEntry | null, seed?: AddTradeSeed): void {
    const isUpdate = entry !== null;
    const data: AddTradeDialogData = { entry, seed };
    const ref = this.dialog.open<AddTradeDialog, AddTradeDialogData, TradeEntryInput | undefined>(
      AddTradeDialog,
      { data, width: '1040px', maxWidth: '95vw', autoFocus: 'first-tabbable' },
    );
    ref
      .afterClosed()
      .pipe(
        filter((input): input is TradeEntryInput => !!input),
        switchMap((input) =>
          (isUpdate ? this.repo.update(entry!.id, input) : this.repo.create(input)).pipe(
            tap((saved) => {
              const key = isUpdate
                ? 'journal.snackbar.updateSuccess'
                : 'journal.snackbar.createSuccess';
              this.toast(key, 'success', { ticker: saved.ticker });
              this.refetch();
            }),
            catchError(() => {
              this.toast(
                isUpdate ? 'journal.snackbar.updateError' : 'journal.snackbar.createError',
                'error',
              );
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }

  /**
   * Snackbar helper — keeps the call-sites focused on the i18n key + variant. `success` lives
   * 3 s, `error` lives 5 s (more time to read the message). Variants are the global classes
   * declared in `libs/ui/src/lib/snack-bar/snack-bar.scss`.
   */
  private toast(key: string, variant: 'success' | 'error', params?: Record<string, unknown>): void {
    this.snackBar.open(this.translate.instant(key, params), undefined, {
      duration: variant === 'success' ? 3000 : 5000,
      panelClass: `stb-snack-bar--${variant}`,
    });
  }
}
