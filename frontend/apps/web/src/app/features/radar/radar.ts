import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbChipsModule,
  StbIconModule,
  StbProgressSpinnerModule,
  StbTableModule,
} from '@portfolioai/ui';
import { catchError, filter, of, switchMap } from 'rxjs';
import {
  ScreenerRepository,
  ScreenerSnapshotResponse,
  TickerMover,
  applyGusChecklist,
} from '../../core/api/screener/screener.repository';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import {
  ConfirmAddStatData,
  ConfirmAddStatDialog,
} from './confirm-add-stat-dialog/confirm-add-stat-dialog';

/** DilutionTracker deep-link base — the radar links out per ticker for the human float/dilution read. */
const DILUTION_TRACKER_BASE = 'https://dilutiontracker.com/app/search';

/**
 * Market radar page — post-pivot rework around the **GUS entry checklist** (gap-up short on a
 * small-cap, cf. `docs/TTD/analyse-company/check-company.md`).
 *
 * The old tweakable filter sidenav is gone : pressing « Rechercher » fetches a fresh snapshot and
 * the table renders the tickers that clear the **fixed**, machine-checkable subset of the checklist
 * ([applyGusChecklist] — price $1–$10, gap ≥ +50 %), sorted by gap desc. Float was dropped (the only
 * free source is stale) so each row instead links out to DilutionTracker for the human float/dilution
 * read, and an « Add stat » button seeds a stat row from the pick.
 *
 * **State model** :
 * - `entries` (signal) — raw movers from the last persisted snapshot. Mutated only by [refresh] or
 *   the initial [loadSnapshot].
 * - `filtered` (computed) — `applyGusChecklist(entries())`. What the table renders.
 * - `fetchedAt` / `loading` / `refreshing` / `error` — envelope-driven UX (cold-start hint, error
 *   banner, button spinner).
 * - `addingSymbol` (signal) — the ticker whose « Add stat » create is in flight (disables that row's
 *   button to avoid a double-submit).
 */
@Component({
  selector: 'app-radar',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    StbButtonModule,
    StbChipsModule,
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
  private readonly stats = inject(StatsRepository);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly entries = signal<TickerMover[]>([]);
  readonly fetchedAt = signal<string | null>(null);
  readonly loading = signal(false);
  readonly refreshing = signal(false);
  readonly error = signal<string | null>(null);
  /** Ticker whose « Add stat » create is in flight — disables that row's button. */
  readonly addingSymbol = signal<string | null>(null);

  readonly displayedColumns = ['symbol', 'price', 'gapPct', 'dilution', 'addStat'];

  /** What the table renders — raw entries passed through the GUS checklist, sorted by gap desc. */
  readonly filtered = computed(() => applyGusChecklist(this.entries()));

  /** No snapshot persisted yet — user has never pressed « Rechercher ». */
  readonly notYetFetched = computed(() => this.fetchedAt() === null);

  /** Snapshot exists but no ticker clears the checklist — show the "no candidate" hint. */
  readonly emptyAfterFilter = computed(
    () => !this.notYetFetched() && this.filtered().length === 0 && !this.loading() && !this.error(),
  );

  ngOnInit(): void {
    this.loadInitial();
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

  /** DilutionTracker deep-link for a ticker — opened in a new tab for the human float/dilution read. */
  dilutionUrl(symbol: string): string {
    return `${DILUTION_TRACKER_BASE}/${symbol}`;
  }

  /**
   * « Add stat » — confirms, then seeds a stats row from the radar pick (ticker / gap / price). The
   * row is owned by the current user and shows up in `/stats` with `source = RADAR`. Best-effort UX :
   * a success/error toast, and the row's button is disabled while the create is in flight.
   */
  onAddStat(row: TickerMover): void {
    if (this.addingSymbol() !== null) return;
    const data: ConfirmAddStatData = { ticker: row.symbol, gapPct: row.gapPct, price: row.price };
    this.dialog
      .open<ConfirmAddStatDialog, ConfirmAddStatData, boolean>(ConfirmAddStatDialog, {
        data,
        width: '420px',
        maxWidth: '95vw',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .pipe(
        filter((confirmed): confirmed is true => confirmed === true),
        switchMap(() => {
          this.addingSymbol.set(row.symbol);
          return this.stats
            .createFromRadar({
              ticker: row.symbol,
              gapUpPercent: row.gapPct,
              openPrice: row.price,
            })
            .pipe(
              catchError(() => {
                this.toast('radar.addStat.error', 'error', { ticker: row.symbol });
                this.addingSymbol.set(null);
                return of(null);
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((created) => {
        if (created) {
          this.toast('radar.addStat.success', 'success', { ticker: row.symbol });
        }
        this.addingSymbol.set(null);
      });
  }

  private toast(key: string, variant: 'success' | 'error', params?: Record<string, unknown>): void {
    this.snackBar.open(this.translate.instant(key, params), undefined, {
      duration: variant === 'success' ? 3000 : 5000,
      panelClass: `stb-snack-bar--${variant}`,
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
