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
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { StbDatePickerModule } from '@portfolioai/ui';

import { JournalRepository } from '../../core/api/journal/journal.repository';
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

/**
 * Trading journal landing page — table of every trade for the current user, plus :
 *   - **Search** : ticker LIKE %q% via the backend `?q=…` query param (debounced 250 ms).
 *   - **Sort** : client-side via MatSort on the already-fetched list (journal is small).
 *   - **Filters** : right-side `<mat-sidenav>` with period presets (this month / last quarter
 *     / etc.), explicit date range, play / pattern multi-selects, status (open / closed /
 *     profitable / losing). Filter changes refetch from the backend.
 *   - **CRUD** : add / edit via Material dialog, delete via native confirm().
 *
 * Effects drive the refetch — `searchTerm` (debounced) and `appliedFilter` (set on Apply) both
 * feed a single effect that calls `repo.findAll(filter)`.
 */
@Component({
  selector: 'app-journal-page',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSidenavModule,
    MatSortModule,
    StbDatePickerModule,
    MatTableModule,
    MatTooltipModule,
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

  // ---- Sort state (client-side, applied on top of the loaded list) ----
  readonly sort = signal<Sort>({ active: '', direction: '' });
  readonly sortedEntries = computed(() => sortEntries(this.entries(), this.sort()));

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
    // Single effect : reads `searchTerm` + `appliedFilter`, refetches on changes. The initial
    // run hits the backend with no filter on component init.
    effect(() => {
      const q = this.searchTerm();
      const f = this.appliedFilter();
      this.fetch({
        query: q || null,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
        plays: f.plays.length > 0 ? f.plays : null,
        patterns: f.patterns.length > 0 ? f.patterns : null,
        status: f.status,
      });
    });
  }

  // ---- Search handlers ----
  onSearchInput(value: string): void {
    this.searchValue.set(value);
    this.searchInput$.next(value);
  }

  clearSearch(): void {
    this.searchValue.set('');
    this.searchInput$.next('');
  }

  // ---- Drawer + filter handlers ----
  toggleDrawer(): void {
    void this.drawer().toggle();
  }

  applyFilters(): void {
    this.appliedFilter.set({ ...this.filterModel() });
    void this.drawer().close();
  }

  resetFilters(): void {
    this.filterModel.set({ ...EMPTY_FILTER });
    this.appliedFilter.set({ ...EMPTY_FILTER });
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
        this.entries.update((list) => list.filter((e) => e.id !== entry.id));
      },
      error: () => this.error.set(this.translate.instant('journal.errors.delete')),
    });
  }

  profitClass(value: number | null): string {
    if (value === null || value === 0) return '';
    return value > 0 ? 'profit-positive' : 'profit-negative';
  }

  private fetch(filter: TradeEntryFilter): void {
    this.loading.set(true);
    this.error.set(null);
    this.repo.findAll(filter).subscribe({
      next: (entries) => {
        this.entries.set(entries);
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
        next: (saved) => {
          this.entries.update((list) =>
            entry ? list.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...list],
          );
        },
        error: () => this.error.set(this.translate.instant('journal.errors.save')),
      });
    });
  }
}

// Pure helper — keeps the component skinny and unit-testable in isolation if we add a spec.
function sortEntries(entries: readonly TradeEntry[], sort: Sort): TradeEntry[] {
  if (!sort.active || sort.direction === '') {
    return entries.slice();
  }
  const dir = sort.direction === 'asc' ? 1 : -1;
  const key = sort.active as keyof TradeEntry;
  return entries.slice().sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * dir;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}
