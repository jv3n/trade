import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Sort } from '@angular/material/sort';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
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
} from '@portfolioai/ui';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  finalize,
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
import {
  PERIOD_PRESETS,
  PeriodPresetKey,
  computePeriodRange,
} from '../../shared/period-preset/period-preset';
import { gapPercent, percentVsOpen, pmPushPercent } from './stats.math';

/** Sort state — controlled-component shape (empty `columnName` = the backend's DEFAULT_SORT). */
interface SortRequest {
  columnName: string;
  isAscending: boolean;
}

/** The session block being typed in the completion panel. Numbers are null until typed. */
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
 * Stats page — the sheet completed after the 4 pm close (cf. `mockup/stats.html` and
 * `mockup/PARCOURS.md`, step 5) :
 *
 * - **KPIs** over the filtered set (not the current page) : stats completed / to complete, average
 *   push at open, average LOD, fade at the close. They come from `GET /api/stats/summary`.
 * - **Completion panel** for a pending stat : the premarket recap on top, then the session prices
 *   with their live % vs the open, the three flags, and Save / Later. It opens on the first pending
 *   stat of the page and on the « Complete » button of any pending row.
 * - **Table** in two column groups — Premarket (copied from the candidate) and Session (price + %
 *   vs the open) — then the flags. Every column is kept ; horizontal scrolling is fine.
 * - **Filters** : search, period preset, pattern, status ; server-side sort + pagination.
 *
 * Stats are created by promoting a candidate (#189) — this page never creates one. The « → Trade »
 * column lands with the stat → trade flow (#193).
 */
@Component({
  selector: 'app-stats-page',
  imports: [
    DatePipe,
    DecimalPipe,
    NumberMaskDirective,
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
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

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
  readonly periods = PERIOD_PRESETS;
  readonly period = signal<PeriodPresetKey>('all');
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
    })),
  );

  // ---- Completion panel ----
  /** The stat being completed — null = the panel is closed. */
  readonly completing = signal<StatEntry | null>(null);
  readonly saving = signal(false);
  readonly session = signal<SessionModel>(BLANK_SESSION);
  /** Rows the user dismissed with « Later » — they stop auto-opening the panel for this visit. */
  private readonly dismissed = signal<ReadonlySet<string>>(new Set());

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

  /** Saving needs the whole session block — a half-filled panel stays "to complete". */
  readonly canSave = computed(() => {
    const m = this.session();
    return (
      isPositive(m.openPrice) &&
      isPositive(m.pushOpenPrice) &&
      isPositive(m.hodPrice) &&
      isPositive(m.lodPrice) &&
      isPositive(m.eodPrice) &&
      !this.hodBelowLod()
    );
  });

  constructor() {
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

  setPeriod(period: PeriodPresetKey): void {
    this.period.set(period);
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

  // ---- Completion panel ----

  complete(entry: StatEntry): void {
    this.completing.set(entry);
    this.session.set(sessionOf(entry));
  }

  setSessionPrice(field: keyof SessionModel, value: number | null): void {
    this.session.update((m) => ({ ...m, [field]: value }));
  }

  toggleFlag(field: 'ssr' | 'under1Dollar' | 'entryAfter11am', value: boolean): void {
    this.session.update((m) => ({ ...m, [field]: value }));
  }

  /** « Later » — closes the panel without saving and stops it re-opening on this stat. */
  later(): void {
    const current = this.completing();
    if (current) {
      this.dismissed.update((set) => new Set(set).add(current.id));
    }
    this.completing.set(null);
  }

  save(): void {
    const entry = this.completing();
    if (!entry || !this.canSave() || this.saving()) return;
    const input = this.toInput(entry, this.session());

    this.saving.set(true);
    this.repo
      .update(entry.id, input)
      .pipe(
        tap((saved) => {
          this.toast('stats.snackbar.completeSuccess', 'success', { ticker: saved.ticker });
          this.completing.set(null);
          this.refetch();
        }),
        catchError(() => {
          this.toast('stats.snackbar.completeError', 'error');
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe();
  }

  // ---- Row actions ----

  delete(entry: StatEntry): void {
    this.confirm
      .ask('stats.confirmDelete', { params: { ticker: entry.ticker }, variant: 'danger' })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.delete(entry.id)),
        tap(() => {
          this.toast('stats.snackbar.deleteSuccess', 'success', { ticker: entry.ticker });
          if (this.completing()?.id === entry.id) this.completing.set(null);
          // Deleting the last row of a non-zero page would strand the user on an empty page.
          if (this.entries().length === 1 && this.pageIndex() > 0) {
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

  // ---- Internals ----

  private currentFilter(): StatEntryFilter {
    const range = computePeriodRange(this.period());
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
   * Opens the completion panel on the first pending stat of the page — the page's job at 4 pm is to
   * complete them. Stats dismissed with « Later » are skipped, and an open panel is never replaced.
   */
  private autoOpenPending(rows: StatEntry[]): void {
    if (this.completing()) return;
    const pending = rows.find((s) => !s.completed && !this.dismissed().has(s.id));
    if (pending) this.complete(pending);
  }

  private refetch(): void {
    this.refetchTrigger.update((n) => n + 1);
  }

  /** The completion panel sends the whole row back — premarket untouched, session + flags updated. */
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

  private toast(key: string, variant: 'success' | 'error', params?: Record<string, unknown>): void {
    this.snackBar.open(this.translate.instant(key, params), undefined, {
      duration: variant === 'success' ? 3000 : 5000,
      panelClass: `stb-snack-bar--${variant}`,
    });
  }
}

function isPositive(n: number | null): boolean {
  return n !== null && n > 0;
}
