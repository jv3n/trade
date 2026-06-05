import { DecimalPipe, NgClass, PercentPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { StbIconModule, StbProgressSpinnerModule } from '@portfolioai/ui';
import {
  NarrativeBias,
  NarrativeBiasFilter,
  NarrativeBiasRepository,
} from '../../../core/api/analysis/narrative-bias.repository';
import { PromptRepository, PromptTemplate } from '../../../core/api/analysis/prompt.repository';
import { buildFilterWindow } from '../../../shared/filter-window/filter-window';

/**
 * `/observability/bias` — Phase 3 #3 « narrative bias dashboard ». Aggregates the entire corpus
 * (across all symbols) and renders four sections :
 *
 * 1. **Sentiment distribution** — % BULLISH / NEUTRAL / BEARISH ; chip « biais suspecté » when one
 *    bucket exceeds 60 %.
 * 2. **Calibration** — for each sentiment, the average price delta at 1d / 1w / 1m. Lets the user
 *    spot a LLM that's bullish but the price keeps dropping (negative calibration).
 * 3. **Topic coverage** — top-15 tokens extracted from the corpus' key_points. The inverse read («
 *    topics never mentioned ») is what surfaces « never talks about volatility » biases.
 * 4. **Thumbs distribution by sentiment** — user-side bias check : do I systematically thumb-up
 *    BULLISH narratives ?
 *
 * Filters mirror the per-symbol observability timeline (date range + prompt version) so the UX
 * stays consistent : the user changes filters and the page re-fetches.
 *
 * **Empty state** is intentional — the dashboard is mostly useless until ~50 snapshots have
 * accumulated, but we render the empty hint rather than a friendlier « come back later » screen
 * because the page is reachable directly from the index and the user may have applied filters
 * that excluded everything (vs « no data ever »).
 */
@Component({
  selector: 'app-bias',
  imports: [
    DecimalPipe,
    FormsModule,
    NgClass,
    PercentPipe,
    RouterLink,
    StbProgressSpinnerModule,
    StbIconModule,
    TranslatePipe,
  ],
  templateUrl: './bias.html',
  styleUrl: './bias.scss',
})
export class BiasPage implements OnInit {
  private readonly repo = inject(NarrativeBiasRepository);
  private readonly promptRepo = inject(PromptRepository);
  private readonly translate = inject(TranslateService);

  bias = signal<NarrativeBias | null>(null);
  loading = signal(true);
  loadError = signal<string | null>(null);

  /** All persisted prompt versions for the family — populates the dropdown. Loaded once on init. */
  prompts = signal<PromptTemplate[]>([]);

  /** Backend filters — change triggers a re-fetch (`fromDate / toDate / promptId`). */
  fromDate = signal<string>(''); // YYYY-MM-DD bound to <input type="date">
  toDate = signal<string>('');
  promptId = signal<string>(''); // '' = no filter ; otherwise a UUID

  /** True when load succeeded but the corpus is empty for the active filter (or no data ever). */
  isEmpty = computed(() => {
    const b = this.bias();
    return (
      !this.loading() && this.loadError() === null && b !== null && b.snapshotsConsidered === 0
    );
  });

  /** Convenience for the « reset » button visibility — at least one filter is non-default. */
  hasActiveFilter = computed(
    () => this.fromDate() !== '' || this.toDate() !== '' || this.promptId() !== '',
  );

  /**
   * Maximum thumbs-bucket size — used to scale the stacked thumbs bars so they share the same
   * x-axis and the « BULLISH has way more thumbs than BEARISH » story reads visually. `0` collapses
   * the bars to zero-width which is the right rendering for an empty bucket.
   */
  maxThumbsTotal = computed(() => {
    const buckets = this.bias()?.thumbsDistribution ?? [];
    return Math.max(
      0,
      ...buckets.map((b) => b.thumbsUp + b.thumbsNeutral + b.thumbsDown + b.noVote),
    );
  });

  ngOnInit() {
    this.loadPrompts();
    this.loadBias();
  }

  loadPrompts() {
    this.promptRepo.list('narrative-default').subscribe({
      next: (rows) => this.prompts.set(rows),
      error: () => this.prompts.set([]),
    });
  }

  loadBias() {
    this.loading.set(true);
    this.loadError.set(null);
    this.repo.findBias(this.buildFilter()).subscribe({
      next: (b) => {
        this.bias.set(b);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(this.translate.instant('biasPage.errors.load'));
        this.loading.set(false);
      },
    });
  }

  /** Delegates to the shared [buildFilterWindow] helper — same contract as observability.ts. */
  private buildFilter(): NarrativeBiasFilter | undefined {
    return buildFilterWindow(this.fromDate(), this.toDate(), this.promptId());
  }

  applyFilters() {
    this.loadBias();
  }

  resetFilters() {
    this.fromDate.set('');
    this.toDate.set('');
    this.promptId.set('');
    this.applyFilters();
  }

  /**
   * Color class for a calibration cell, based on the sign of the average delta. `null` deltas get
   * the muted class — distinguishing « no data » (window not elapsed for any snapshot in the
   * bucket) from a true zero.
   */
  deltaClass(value: number | null): string {
    if (value === null) return 'delta-muted';
    if (value > 0) return 'delta-up';
    if (value < 0) return 'delta-down';
    return 'delta-zero';
  }

  /**
   * Returns the percentage width (`0..100`) of one segment of a stacked thumbs bar, scaled
   * against [maxThumbsTotal] so all three sentiment bars share the same x-axis. Returns `0` when
   * the max is zero (empty corpus) — Math.max would otherwise NaN.
   */
  thumbsBarWidth(value: number): number {
    const max = this.maxThumbsTotal();
    if (max <= 0) return 0;
    return Math.round((value / max) * 100);
  }
}
