import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import {
  DEFAULT_SCREENER_FILTER,
  ScreenerFilter,
  ScreenerRepository,
  TickerMover,
} from '../../core/api/screener/screener.repository';
import { ScreenerFilterRepository } from '../../core/local/screener-filter/screener-filter.repository';
import { RadarFilterPanel } from './radar-filter-panel';

/**
 * Market radar page — Phase 6 v1 entry surface. Lays out the user-editable filter panel on the
 * left and the result table on the right. The table is sorted by `gapPct` descending so the
 * loudest movers float to the top, matching the backend's sort order.
 *
 * **State model** :
 * - `filter` (signal) — the active filter, hydrated from `localStorage` on construction with a
 *   fallback to [DEFAULT_SCREENER_FILTER]. The panel emits `filterChanged` (debounced 300 ms),
 *   which the page persists + uses to refetch.
 * - `movers` (signal) — the current table rows, mutated by the fetch pipeline.
 * - `loading` / `error` (signals) — drive the loading spinner and the inline error banner. Empty
 *   `movers` is **not** an error : the empty-state hint covers "no abnormal move detected"
 *   distinctly from "fetch failed".
 *
 * Errors from the repo (typically a 503 when the upstream provider is rate-limited or down)
 * surface as an inline banner with a translated message — the rest of the page stays usable so
 * the user can adjust filters and retry.
 */
@Component({
  selector: 'app-radar',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    TranslatePipe,
    RadarFilterPanel,
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
  readonly movers = signal<TickerMover[]>([]);
  readonly loading = signal(false);
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

  readonly isEmpty = computed(() => !this.loading() && !this.error() && this.movers().length === 0);

  ngOnInit(): void {
    this.fetch(this.filter());
  }

  onFilterChanged(next: ScreenerFilter): void {
    this.filter.set(next);
    this.filterStorage.save(next);
    this.fetch(next);
  }

  onResetRequested(): void {
    this.filter.set(DEFAULT_SCREENER_FILTER);
    this.filterStorage.save(DEFAULT_SCREENER_FILTER);
    this.fetch(DEFAULT_SCREENER_FILTER);
  }

  private fetch(filter: ScreenerFilter): void {
    this.loading.set(true);
    this.error.set(null);
    this.screener
      .findMovers(filter)
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('radar.errors.fetch'));
          return of<TickerMover[]>([]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => {
        this.movers.set(rows);
        this.loading.set(false);
      });
  }
}
