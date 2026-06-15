import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { MatDialog } from '@angular/material/dialog';
import { PageEvent } from '@angular/material/paginator';
import { MatSidenav } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Sort } from '@angular/material/sort';
import { Router, RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
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
} from '@portfolioai/ui';
import { format } from 'date-fns';
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
  PageRequest,
  StatEntry,
  StatEntryFilter,
  StatEntryInput,
  StatSource,
} from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { NumberMaskDirective } from '../../shared/number-mask/number-mask.directive';
import {
  PERIOD_PRESETS,
  PeriodPresetKey,
  computePeriodRange,
} from '../../shared/period-preset/period-preset';
import { AddStatDialog, AddStatDialogData } from './add-stat-dialog/add-stat-dialog';

/**
 * Sort state for the stats table — controlled-component shape (empty `columnName` = no user sort,
 * backend falls back to its DEFAULT_SORT). Bound into MatSort via `[matSortActive]` /
 * `[matSortDirection]`.
 */
interface SortRequest {
  columnName: string;
  isAscending: boolean;
}

interface FilterFormModel {
  period: PeriodPresetKey;
  dateFrom: Date | null;
  dateTo: Date | null;
  source: StatSource | null;
  gapMin: number | null;
  gapMax: number | null;
}

const EMPTY_FILTER: FilterFormModel = {
  period: 'all',
  dateFrom: null,
  dateTo: null,
  source: null,
  gapMin: null,
  gapMax: null,
};

/** The user-owned origins (editable / deletable). IMPORT rows are read-only. */
const OWNED_SOURCES: readonly StatSource[] = ['RADAR', 'MANUAL'];

/** Origins offered in the filter drawer's source select. */
const SOURCE_OPTIONS: readonly StatSource[] = ['RADAR', 'MANUAL', 'IMPORT'];

const DEFAULT_PAGE_SIZE = 10;

/**
 * Stats page — table of the stats the current user may see (their own radar / manual analyses + the
 * global community IMPORT rows), at parity with the journal :
 *   - **Search** : ticker LIKE %q% via `?q=…` (debounced 250 ms).
 *   - **Filters** : right-side drawer — date range, source (radar / manual / import), gap range.
 *   - **Server-side sort + pagination** : MatSort → `?sort=field,direction` ; `<mat-paginator>`.
 *   - **CRUD** : add / edit via the [AddStatDialog], delete via confirm(). Edit / delete are exposed
 *     **only on owned rows** (`source !== IMPORT`) — the server enforces ownership regardless.
 *
 * One effect watches (`searchTerm`, `appliedFilter`, `sort`, `pageIndex`, `pageSize`, `refetchTrigger`)
 * and refetches when any changes.
 */
@Component({
  selector: 'app-stats-page',
  imports: [
    DatePipe,
    DecimalPipe,
    NumberMaskDirective,
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
  templateUrl: './stats-page.html',
  styleUrl: './stats-page.scss',
})
export class StatsPage {
  private readonly repo = inject(StatsRepository);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  // ---- Data state ----
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly entries = signal<StatEntry[]>([]);
  readonly totalElements = signal(0);

  // ---- Pagination ----
  readonly pageIndex = signal(0);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly pageSizeOptions = [10, 25, 50, 100];

  // ---- Refetch nudge (CRUD ops bump it to re-fire the fetch effect, à la journal) ----
  private readonly refetchTrigger = signal(0);

  // ---- Search (debounced 250 ms) ----
  private readonly searchInput$ = new Subject<string>();
  readonly searchTerm = toSignal(
    this.searchInput$.pipe(debounceTime(250), distinctUntilChanged()),
    { initialValue: '' },
  );
  readonly searchValue = signal('');

  // ---- Filter drawer ----
  readonly drawer = viewChild.required<MatSidenav>('filterDrawer');
  readonly filterModel = signal<FilterFormModel>(EMPTY_FILTER);
  readonly appliedFilter = signal<FilterFormModel>(EMPTY_FILTER);
  readonly activeFilterCount = computed(() => {
    const f = this.appliedFilter();
    let n = 0;
    if (f.dateFrom || f.dateTo) n += 1;
    if (f.source) n += 1;
    if (f.gapMin != null || f.gapMax != null) n += 1;
    return n;
  });

  // ---- Sort (server-side, controlled-component) ----
  readonly sort = signal<SortRequest>({ columnName: '', isAscending: true });

  readonly periods = PERIOD_PRESETS;
  readonly sourceOptions = SOURCE_OPTIONS;

  readonly columns = [
    'tradeDate',
    'ticker',
    'source',
    'gapUpPercent',
    'floatSharesMillions',
    'institutionsPercent',
    'openPrice',
    'highPrice',
    'lodPrice',
    'eodPrice',
    'pushPercent',
    'lodPercent',
    'eodPercent',
    'note',
    'actions',
  ] as const;

  constructor() {
    effect(() => {
      const q = this.searchTerm();
      const f = this.appliedFilter();
      const sort = this.sort();
      const pageIndex = this.pageIndex();
      const pageSize = this.pageSize();
      this.refetchTrigger();
      this.fetch(
        {
          query: q || null,
          dateFrom: f.dateFrom,
          dateTo: f.dateTo,
          source: f.source,
          gapMin: f.gapMin,
          gapMax: f.gapMax,
        },
        {
          pageIndex,
          pageSize,
          sortField: sort.columnName || undefined,
          sortDirection: sort.columnName ? (sort.isAscending ? 'asc' : 'desc') : undefined,
        },
      );
    });
  }

  /** Owned rows (radar / manual) are editable + deletable ; IMPORT rows are read-only. */
  isOwned(entry: StatEntry): boolean {
    return OWNED_SOURCES.includes(entry.source);
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

  /** Picking a preset populates dateFrom / dateTo via `date-fns` helpers (same as the journal). */
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

  setDateFrom(d: Date | null): void {
    this.filterModel.update((m) => ({ ...m, period: 'custom', dateFrom: d }));
  }

  setDateTo(d: Date | null): void {
    this.filterModel.update((m) => ({ ...m, period: 'custom', dateTo: d }));
  }

  setSource(s: StatSource | null): void {
    this.filterModel.update((m) => ({ ...m, source: s }));
  }

  setGapMin(n: number | null): void {
    this.filterModel.update((m) => ({ ...m, gapMin: n }));
  }

  setGapMax(n: number | null): void {
    this.filterModel.update((m) => ({ ...m, gapMax: n }));
  }

  // ---- Sort + pagination ----
  onSortChange(s: Sort): void {
    this.sort.set({
      columnName: s.direction !== '' ? s.active : '',
      isAscending: s.direction === 'asc',
    });
    this.pageIndex.set(0);
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  // ---- CRUD ----
  openCreate(): void {
    this.openDialog(null);
  }

  openEdit(entry: StatEntry): void {
    this.openDialog(entry);
  }

  /**
   * Jumps to the journal and pre-fills a new trade from this stat row : ticker + date are seeded
   * and the trade is pre-linked to this stat (`statId` → the trade's `statEntryId` FK). The journal
   * page reads these query params, opens the add-trade dialog pre-filled, then strips the params.
   * Available on every row (including global IMPORT ones), not just owned ones.
   */
  createTrade(entry: StatEntry): void {
    void this.router.navigate(['/journal'], {
      queryParams: {
        ticker: entry.ticker,
        date: format(entry.tradeDate, 'yyyy-MM-dd'),
        statId: entry.id,
      },
    });
  }

  delete(entry: StatEntry): void {
    const confirmMsg = this.translate.instant('stats.confirmDelete', { ticker: entry.ticker });
    if (!confirm(confirmMsg)) return;

    const willEmptyPage = this.entries().length === 1 && this.pageIndex() > 0;

    this.repo
      .delete(entry.id)
      .pipe(
        tap(() => {
          this.toast('stats.snackbar.deleteSuccess', 'success', { ticker: entry.ticker });
          if (willEmptyPage) {
            this.pageIndex.update((n) => n - 1);
          } else {
            this.refetch();
          }
        }),
        catchError(() => {
          this.toast('stats.snackbar.deleteError', 'error');
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private refetch(): void {
    this.refetchTrigger.update((n) => n + 1);
  }

  private fetch(filter: StatEntryFilter, page: PageRequest): void {
    this.loading.set(true);
    this.error.set(null);
    this.repo.findAll(filter, page).subscribe({
      next: (result) => {
        this.entries.set(result.content);
        this.totalElements.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('stats.errors.load'));
        this.loading.set(false);
      },
    });
  }

  /**
   * Dialog → save pipeline. `afterClosed()` emits the form result ; `switchMap` chains into create
   * (new) or update (edit). A 409 (day/ticker collision) surfaces a dedicated toast.
   */
  private openDialog(entry: StatEntry | null): void {
    const isUpdate = entry !== null;
    const data: AddStatDialogData = { entry };
    const ref = this.dialog.open<AddStatDialog, AddStatDialogData, StatEntryInput | undefined>(
      AddStatDialog,
      { data, width: '760px', maxWidth: '95vw', autoFocus: 'first-tabbable' },
    );
    ref
      .afterClosed()
      .pipe(
        filter((input): input is StatEntryInput => !!input),
        switchMap((input) =>
          (isUpdate ? this.repo.update(entry!.id, input) : this.repo.create(input)).pipe(
            tap((saved) => {
              const key = isUpdate
                ? 'stats.snackbar.updateSuccess'
                : 'stats.snackbar.createSuccess';
              this.toast(key, 'success', { ticker: saved.ticker });
              this.refetch();
            }),
            catchError((err: { status?: number }) => {
              const key =
                err?.status === 409
                  ? 'stats.snackbar.duplicate'
                  : isUpdate
                    ? 'stats.snackbar.updateError'
                    : 'stats.snackbar.createError';
              this.toast(key, 'error');
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }

  private toast(key: string, variant: 'success' | 'error', params?: Record<string, unknown>): void {
    this.snackBar.open(this.translate.instant(key, params), undefined, {
      duration: variant === 'success' ? 3000 : 5000,
      panelClass: `stb-snack-bar--${variant}`,
    });
  }
}
