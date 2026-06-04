import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';

import { MatDialog } from '@angular/material/dialog';

import { PageEvent } from '@angular/material/paginator';
import { MatSidenav } from '@angular/material/sidenav';
import { Sort } from '@angular/material/sort';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { StbDatePickerModule } from '@portfolioai/ui';

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
import { AddTradeDialog, AddTradeDialogData } from './add-trade-dialog/add-trade-dialog';
import { PERIOD_PRESETS, PeriodPresetKey, computePeriodRange } from './period-preset';
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
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
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
    StbDatePickerModule,
    StbTableModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './journal-page.html',
  styleUrl: './journal-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JournalPage {
  private readonly repo = inject(JournalRepository);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  // ---- Data state ----
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly entries = signal<TradeEntry[]>([]);
  readonly totalElements = signal(0);

  // ---- Pagination ----
  readonly pageIndex = signal(0);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly pageSizeOptions = [10, 25, 50, 100];

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

  // ---- Sort (server-side) ----
  readonly sort = signal<Sort>({ active: '', direction: '' });

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
    'actions',
  ] as const;

  constructor() {
    effect(() => {
      const q = this.searchTerm();
      const f = this.appliedFilter();
      const sort = this.sort();
      const pageIndex = this.pageIndex();
      const pageSize = this.pageSize();
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
          sortField: sort.active || undefined,
          sortDirection: sort.direction || undefined,
        },
      );
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
  onSortChange(s: Sort): void {
    this.sort.set(s);
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

  delete(entry: TradeEntry): void {
    const confirmMsg = this.translate.instant('journal.confirmDelete', { ticker: entry.ticker });
    if (!confirm(confirmMsg)) return;

    this.repo.delete(entry.id).subscribe({
      next: () => {
        // Refetch the current page — local splicing would leave us with N-1 rows on the page
        // and the total count out of sync ; trust the server for both.
        this.refetch();
      },
      error: () => this.error.set(this.translate.instant('journal.errors.delete')),
    });
  }

  /**
   * Re-runs the current effect by nudging one of its dependencies. We bump the search input
   * with the same value to force a refetch without touching any user-facing state.
   */
  private refetch(): void {
    this.searchInput$.next(this.searchValue());
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

  private openDialog(entry: TradeEntry | null): void {
    const data: AddTradeDialogData = { entry };
    const ref = this.dialog.open<AddTradeDialog, AddTradeDialogData, TradeEntryInput | undefined>(
      AddTradeDialog,
      { data, width: '880px', maxWidth: '95vw', autoFocus: 'first-tabbable' },
    );
    ref.afterClosed().subscribe((input) => {
      if (!input) return;
      const obs = entry ? this.repo.update(entry.id, input) : this.repo.create(input);
      obs.subscribe({
        next: () => this.refetch(),
        error: () => this.error.set(this.translate.instant('journal.errors.save')),
      });
    });
  }
}
