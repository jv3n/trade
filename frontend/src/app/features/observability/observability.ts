import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass, PercentPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  NarrativeObservabilityRepository,
  NarrativeObservation,
} from '../../core/narrative-observability.repository';

/**
 * `/observability/:symbol` — Phase 3 #1 « narrative vs price » timeline. Renders a reverse-
 * chronological list of past narratives, each card carrying :
 *
 * - the **generation date** + **sentiment chip** + **prompt version chip** (when known) +
 *   **thumbs marker** (when a vote was cast),
 * - the **price-since deltas** (1d / 1w / 1m) colorized red / green / muted, with the
 *   target prices as tooltip,
 * - a short **summary preview** that expands to the full narrative + keyPoints on click.
 *
 * **Filters land in PR3** (prompt selector + thumbs + date range). v1 ships the timeline raw —
 * the page is reachable by a direct URL or, later in PR3, a link from the dossier ticker.
 *
 * **Verdict semantics** are kept implicit on purpose : the page renders the deltas and the
 * sentiment side-by-side, leaving the human to read « the LLM said BULLISH and the price
 * dropped — miss ». An automatic « miss / hit » label is deliberately out-of-scope for v1
 * because the heuristic is opinionated (« neutral » + flat price isn't a miss, but how flat ?)
 * — better than a wrong label.
 */
@Component({
  selector: 'app-observability',
  imports: [
    DatePipe,
    DecimalPipe,
    NgClass,
    PercentPipe,
    RouterLink,
    MatProgressSpinnerModule,
    MatIconModule,
    TranslatePipe,
  ],
  templateUrl: './observability.html',
  styleUrl: './observability.scss',
})
export class ObservabilityPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly repo = inject(NarrativeObservabilityRepository);
  private readonly translate = inject(TranslateService);

  symbol = signal<string>('');
  observations = signal<NarrativeObservation[]>([]);
  loading = signal(true);
  loadError = signal<string | null>(null);
  expandedId = signal<string | null>(null);

  /** True when the timeline is empty and we know it for sure (loaded, not failed). */
  isEmpty = computed(
    () => !this.loading() && this.loadError() === null && this.observations().length === 0,
  );

  /**
   * True when every observation in the loaded timeline has all 6 price-since fields null —
   * suggests the upstream chart fetch failed (graceful degradation kicked in on the backend).
   * The template renders a discreet « price action unavailable » banner in that case so the
   * user doesn't wonder why every delta column reads «&nbsp;—&nbsp;».
   */
  pricesAllUnavailable = computed(() => {
    const obs = this.observations();
    if (obs.length === 0) return false;
    return obs.every(
      (o) =>
        o.priceAt1d === null &&
        o.priceAt1w === null &&
        o.priceAt1m === null &&
        o.delta1d === null &&
        o.delta1w === null &&
        o.delta1m === null,
    );
  });

  ngOnInit() {
    const symbol = (this.route.snapshot.paramMap.get('symbol') ?? '').toUpperCase();
    this.symbol.set(symbol);
    if (!symbol) {
      this.loadError.set(this.translate.instant('observabilityPage.errors.missingSymbol'));
      this.loading.set(false);
      return;
    }
    this.loadTimeline(symbol);
  }

  /** Re-fetch the timeline — public so the « Refresh » button + the `Retry` action can call it. */
  loadTimeline(symbol: string) {
    this.loading.set(true);
    this.loadError.set(null);
    this.repo.findFor(symbol).subscribe({
      next: (response) => {
        this.observations.set(response.observations);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(this.translate.instant('observabilityPage.errors.load'));
        this.loading.set(false);
      },
    });
  }

  toggle(id: string) {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  isExpanded(id: string): boolean {
    return this.expandedId() === id;
  }

  /**
   * Returns the CSS class name for a delta cell, based on the sign. `null` deltas get the muted
   * class — distinguishing « no data » (window not elapsed yet, upstream down) from a true flat
   * close, which is colour-coded as `delta-zero`.
   */
  deltaClass(value: number | null): string {
    if (value === null) return 'delta-muted';
    if (value > 0) return 'delta-up';
    if (value < 0) return 'delta-down';
    return 'delta-zero';
  }
}
