import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import {
  MarketRepository,
  TickerNarrativeSnapshot,
  TickerSnapshot,
} from '../../core/market.repository';

interface Point {
  x: number;
  y: number;
}

@Component({
  selector: 'app-ticker',
  imports: [CommonModule, RouterLink, MatIconModule, MatProgressSpinnerModule, TranslatePipe],
  templateUrl: './ticker.html',
  styleUrl: './ticker.scss',
})
export class TickerPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly marketRepository = inject(MarketRepository);
  private readonly translate = inject(TranslateService);

  symbol = signal<string>('');
  loading = signal(false);
  error = signal<string | null>(null);
  snapshot = signal<TickerSnapshot | null>(null);

  // ---- Narrative state ----

  /** Latest persisted narrative for the current symbol, or null when none exists yet. */
  narrative = signal<TickerNarrativeSnapshot | null>(null);
  /** True while a generation is pending (POST kick + polling). */
  narrativeLoading = signal(false);
  /** Surfaces parse / poll / abort errors from the narrative pipeline. */
  narrativeError = signal<string | null>(null);
  private narrativePollSub?: Subscription;

  // ---- Derived state for the chart ----

  /** Width / height units of the viewBox. The SVG scales to its container. */
  readonly chartWidth = 800;
  readonly chartHeight = 240;
  private readonly chartPadding = 8;

  closes = computed<Point[]>(() => {
    const bars = this.snapshot()?.bars ?? [];
    if (bars.length < 2) return [];
    const closes = bars.map((b) => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const w = this.chartWidth - this.chartPadding * 2;
    const h = this.chartHeight - this.chartPadding * 2;
    return closes.map((c, i) => ({
      x: this.chartPadding + (i / (closes.length - 1)) * w,
      y: this.chartPadding + (1 - (c - min) / range) * h,
    }));
  });

  pricePath = computed(() => {
    const pts = this.closes();
    if (pts.length === 0) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
  });

  // ---- Indicator helpers (used in template for color bands) ----

  rsiClass = computed(() => {
    const r = this.snapshot()?.indicators?.rsi14;
    if (r === null || r === undefined) return '';
    if (r >= 70) return 'warning';
    if (r <= 30) return 'warning';
    return '';
  });

  drawdownClass = computed(() => {
    const d = this.snapshot()?.indicators?.drawdownFrom52wHigh;
    if (d === null || d === undefined) return '';
    if (d <= -20) return 'danger';
    if (d >= -5) return 'success';
    return '';
  });

  perfClass(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    if (value > 0) return 'success';
    if (value < 0) return 'danger';
    return '';
  }

  signed(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
  }

  private errorMessage(err: { status?: number } | undefined, symbol: string): string {
    switch (err?.status) {
      case 404:
        return this.translate.instant('ticker.errors.notFound', { symbol });
      case 503:
        return this.translate.instant('ticker.errors.rateLimit');
      default:
        return this.translate.instant('ticker.errors.generic');
    }
  }

  // ---- Lifecycle ----

  ngOnInit(): void {
    const s = this.route.snapshot.paramMap.get('symbol');
    if (!s) {
      this.error.set(this.translate.instant('ticker.errors.missingSymbol'));
      return;
    }
    this.symbol.set(s);
    this.load(s);
    this.loadLatestNarrative(s);
  }

  ngOnDestroy(): void {
    this.narrativePollSub?.unsubscribe();
  }

  load(symbol: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.marketRepository.getTicker(symbol).subscribe({
      next: (snap) => {
        this.snapshot.set(snap);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(this.errorMessage(err, symbol));
        this.loading.set(false);
      },
    });
  }

  // ---- Narrative actions ----

  /**
   * Reads the most recent persisted snapshot, if any. 404 is normal (first visit) — the adapter
   * maps it to `null` so we don't surface a scary error on the happy "no narrative yet" path.
   */
  private loadLatestNarrative(symbol: string): void {
    this.marketRepository.getLatestNarrative(symbol).subscribe({
      next: (snap) => this.narrative.set(snap),
      error: () => {
        // Non-404 error : keep going silently. The user can still click "Générer" to retry.
        this.narrative.set(null);
      },
    });
  }

  /**
   * Kicks a narrative generation. Three branches :
   * - POST returns DONE immediately → cache hit (snapshot < 30 min) → fetch and display it.
   * - POST returns PENDING → poll until DONE / ERROR → fetch the snapshot on success.
   * - POST or polling throws → surface in narrativeError, stop loading.
   */
  generateNarrative(): void {
    const sym = this.symbol();
    if (!sym || this.narrativeLoading()) return;
    this.narrativeLoading.set(true);
    this.narrativeError.set(null);
    this.narrativePollSub?.unsubscribe();

    this.marketRepository.requestNarrative(sym).subscribe({
      next: (job) => {
        if (job.status === 'DONE') {
          this.fetchNarrativeAfterCompletion(sym);
          return;
        }
        if (job.status === 'ERROR') {
          this.narrativeError.set(
            job.error ?? this.translate.instant('ticker.narrative.errorGeneric'),
          );
          this.narrativeLoading.set(false);
          return;
        }
        this.narrativePollSub = this.marketRepository.pollNarrativeJob(sym, job.jobId).subscribe({
          next: (updated) => {
            if (updated.status === 'DONE') {
              this.fetchNarrativeAfterCompletion(sym);
            } else if (updated.status === 'ERROR') {
              this.narrativeError.set(
                updated.error ?? this.translate.instant('ticker.narrative.errorGeneric'),
              );
              this.narrativeLoading.set(false);
            }
          },
          error: (err: Error) => {
            this.narrativeError.set(
              err.message ?? this.translate.instant('ticker.narrative.errorPolling'),
            );
            this.narrativeLoading.set(false);
          },
        });
      },
      error: () => {
        this.narrativeError.set(this.translate.instant('ticker.narrative.errorRequest'));
        this.narrativeLoading.set(false);
      },
    });
  }

  private fetchNarrativeAfterCompletion(symbol: string): void {
    this.marketRepository.getLatestNarrative(symbol).subscribe({
      next: (snap) => {
        this.narrative.set(snap);
        this.narrativeLoading.set(false);
      },
      error: () => {
        this.narrativeError.set(this.translate.instant('ticker.narrative.errorReload'));
        this.narrativeLoading.set(false);
      },
    });
  }

  sentimentClass(s: TickerNarrativeSnapshot | null): string {
    if (!s) return '';
    return `sentiment-${s.sentiment.toLowerCase()}`;
  }
}
