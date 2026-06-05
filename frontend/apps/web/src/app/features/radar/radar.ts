import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbIconModule,
  StbProgressSpinnerModule,
  StbTableModule,
} from '@portfolioai/ui';
import { catchError, of } from 'rxjs';
import {
  DEFAULT_SCREENER_FILTER,
  ScreenerFilter,
  ScreenerRepository,
  ScreenerSnapshotResponse,
  TickerMover,
  applyScreenerFilter,
} from '../../core/api/screener/screener.repository';
import { ScreenerFilterRepository } from '../../core/local/screener-filter/screener-filter.repository';
import { RadarFilterPanel } from './radar-filter-panel';

/**
 * Market radar page after Phase 6 ticket (9) — snapshot persistance + in-process filtering.
 *
 * **State model** :
 * - `filter` (signal) — the active filter, hydrated from `localStorage` on construction with a
 *   fallback to [DEFAULT_SCREENER_FILTER]. Mutated by the panel ; **does not** trigger an HTTP
 *   call.
 * - `entries` (signal) — raw movers list from the last persisted snapshot. Mutated only by
 *   [refresh] or the initial [loadSnapshot] on init. The filter tweaks the **derived** view, not
 *   this list.
 * - `filtered` (computed) — `applyScreenerFilter(entries(), filter())`, sorted by gap desc. This
 *   is what the table renders.
 * - `fetchedAt` (signal) — ISO timestamp of the persisted snapshot. `null` when no snapshot is
 *   persisted yet (first visit) — drives the "press Rechercher" hint.
 * - `loading` / `refreshing` / `error` (signals) — `loading` covers the initial GET ; `refreshing`
 *   covers the explicit POST so the « Rechercher » button can show its own spinner without
 *   blanking the table.
 *
 * **Why this split** : the previous v0.3 flow re-hit the provider on every panel tweak — quota
 * was burned in seconds on FMP (250 req/jour). v0.4 isolates the live fetch behind the explicit
 * « Rechercher » button ; subsequent filter tweaks are zero-HTTP and instant. The frontend filter
 * predicate mirrors the backend's old `MarketScreenerService.matches()` 1:1 so a future move back
 * to server-side filtering wouldn't shift behaviour.
 */
@Component({
  selector: 'app-radar',
  imports: [
    DatePipe,
    DecimalPipe,
    RadarFilterPanel,
    RouterLink,
    StbButtonModule,
    StbIconModule,
    StbProgressSpinnerModule,
    StbTableModule,
    TranslatePipe,
  ],
  templateUrl: './radar.html',
  styleUrl: './radar.scss',
})
export class RadarPage implements OnInit {
  private readonly screener = inject(ScreenerRepository);
  private readonly filterStorage = inject(ScreenerFilterRepository);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly filter = signal<ScreenerFilter>(this.filterStorage.load() ?? DEFAULT_SCREENER_FILTER);
  readonly entries = signal<TickerMover[]>([]);
  readonly fetchedAt = signal<string | null>(null);
  readonly loading = signal(false);
  readonly refreshing = signal(false);
  readonly error = signal<string | null>(null);

  readonly displayedColumns = [
    'symbol',
    'name',
    'price',
    'gapPct',
    'volumeRatio',
    'marketCapUsd',
    'sector',
  ];

  /** What the table renders — raw entries filtered + sorted in-process. */
  readonly filtered = computed(() => applyScreenerFilter(this.entries(), this.filter()));

  /** No snapshot persisted yet — user has never pressed « Rechercher ». */
  readonly notYetFetched = computed(() => this.fetchedAt() === null);

  /** Snapshot exists but the active filter matches nothing — show the "loosen filters" hint. */
  readonly emptyAfterFilter = computed(
    () => !this.notYetFetched() && this.filtered().length === 0 && !this.loading() && !this.error(),
  );

  ngOnInit(): void {
    this.loadInitial();
  }

  onFilterChanged(next: ScreenerFilter): void {
    this.filter.set(next);
    this.filterStorage.save(next);
  }

  onResetRequested(): void {
    this.filter.set(DEFAULT_SCREENER_FILTER);
    this.filterStorage.save(DEFAULT_SCREENER_FILTER);
  }

  onRefreshRequested(): void {
    this.refreshing.set(true);
    this.error.set(null);
    this.screener
      .refresh()
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('radar.errors.refresh'));
          return of<ScreenerSnapshotResponse | null>(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        if (response) {
          this.apply(response);
        }
        this.refreshing.set(false);
      });
  }

  private loadInitial(): void {
    this.loading.set(true);
    this.error.set(null);
    this.screener
      .loadSnapshot()
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('radar.errors.fetch'));
          return of<ScreenerSnapshotResponse | null>(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        if (response) {
          this.apply(response);
        }
        this.loading.set(false);
      });
  }

  private apply(response: ScreenerSnapshotResponse): void {
    this.entries.set(response.movers);
    this.fetchedAt.set(response.fetchedAt);
  }
}
