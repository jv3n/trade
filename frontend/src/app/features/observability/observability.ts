import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass, PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  NarrativeObservabilityRepository,
  NarrativeObservation,
  NarrativeObservationsFilter,
} from '../../core/narrative-observability.repository';
import { PromptRepository, PromptTemplate } from '../../core/prompt.repository';

/**
 * Thumbs filter state on the page — `'all'` shows every observation, the three numeric values
 * filter to a specific vote. The filter is **client-side** : the backend already returned every
 * observation in the timeframe, we just hide a subset on the frontend. Server-side filtering
 * would force a re-fetch on every chip click without a meaningful traffic reduction (the
 * timeline is ≤ 500 rows by design).
 */
export type ThumbsFilter = 'all' | 1 | 0 | -1;

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
    FormsModule,
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
  private readonly promptRepo = inject(PromptRepository);
  private readonly translate = inject(TranslateService);

  symbol = signal<string>('');
  observations = signal<NarrativeObservation[]>([]);
  loading = signal(true);
  loadError = signal<string | null>(null);
  expandedId = signal<string | null>(null);

  // -------------------------------------------------------------------- filters (PR3)

  /** All persisted prompt versions for the family — populates the dropdown. Loaded once on init. */
  prompts = signal<PromptTemplate[]>([]);

  /** Backend filters — change triggers a re-fetch (`fromDate` / `toDate` / `promptId`). */
  fromDate = signal<string>(''); // YYYY-MM-DD bound to <input type="date">
  toDate = signal<string>('');
  promptId = signal<string>(''); // '' = no filter ; otherwise a UUID

  /** Thumbs filter is local-only — pure client-side slice of the already-loaded list. */
  thumbs = signal<ThumbsFilter>('all');

  /**
   * Observations after the client-side thumbs filter is applied. `'all'` is a pass-through,
   * the numeric values match `thumbsValue`. Snapshots without a `prompt_score` row
   * (`thumbsValue === null`) only show up when the filter is `'all'` — filtering to a specific
   * vote naturally excludes them.
   */
  filteredObservations = computed<NarrativeObservation[]>(() => {
    const t = this.thumbs();
    if (t === 'all') return this.observations();
    return this.observations().filter((o) => o.thumbsValue === t);
  });

  /** True when the timeline is empty and we know it for sure (loaded, not failed). */
  isEmpty = computed(
    () => !this.loading() && this.loadError() === null && this.observations().length === 0,
  );

  /**
   * True when the timeline returned rows but the active **thumbs** filter hid every single one.
   * Distinct from [isEmpty] (« nothing in the DB ») — here the data exists but is filtered out,
   * so the template renders a « no result for the current filter » hint with a reset action.
   */
  isFilteredEmpty = computed(
    () =>
      !this.loading() &&
      this.loadError() === null &&
      this.observations().length > 0 &&
      this.filteredObservations().length === 0,
  );

  /** Convenience for the « reset » button visibility — at least one filter is non-default. */
  hasActiveFilter = computed(
    () =>
      this.fromDate() !== '' ||
      this.toDate() !== '' ||
      this.promptId() !== '' ||
      this.thumbs() !== 'all',
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
    this.loadPrompts();
    this.loadTimeline(symbol);
  }

  /** Load the prompt versions for the dropdown. Failure is silent — the dropdown stays empty. */
  loadPrompts() {
    this.promptRepo.list('narrative-default').subscribe({
      next: (rows) => this.prompts.set(rows),
      error: () => {
        // Empty list ; dropdown won't render the prompt options. Not worth a banner — the
        // observability timeline itself is the load that matters.
        this.prompts.set([]);
      },
    });
  }

  /** Re-fetch the timeline — public so the « Refresh » button + the `Retry` action can call it. */
  loadTimeline(symbol: string) {
    this.loading.set(true);
    this.loadError.set(null);
    this.repo.findFor(symbol, this.buildFilter()).subscribe({
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

  /**
   * Translates the page's filter signals into the wire-shape consumed by the adapter. Date
   * pickers emit `YYYY-MM-DD` ; we expand to the boundary of the day in UTC (`00:00:00Z` for
   * `from`, `00:00:00Z` of the next day for `to` so the interval stays half-open). `promptId =
   * ''` collapses to undefined — the adapter omits empty strings anyway, but the explicit
   * collapse keeps the contract obvious at the call site.
   */
  private buildFilter(): NarrativeObservationsFilter | undefined {
    const from = this.fromDate() ? `${this.fromDate()}T00:00:00Z` : undefined;
    const to = this.toDate() ? `${this.nextDayIso(this.toDate())}T00:00:00Z` : undefined;
    const promptId = this.promptId() || undefined;
    if (!from && !to && !promptId) return undefined;
    return { from, to, promptId };
  }

  /**
   * `YYYY-MM-DD` → `YYYY-MM-DD` of the next calendar day. Lets the `to` filter behave as «
   * include this day ». No DST gymnastics needed — we're working in UTC plain dates.
   */
  private nextDayIso(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Re-runs the backend fetch with the current filter values. Bound to the « apply » button
   * and to immediate handlers when a filter changes (date input blur, dropdown change).
   */
  applyFilters() {
    if (this.symbol()) this.loadTimeline(this.symbol());
  }

  /**
   * Resets all filters to the default and re-fetches. Wires to the « Reset » action visible
   * when [hasActiveFilter] is true.
   */
  resetFilters() {
    this.fromDate.set('');
    this.toDate.set('');
    this.promptId.set('');
    this.thumbs.set('all');
    this.applyFilters();
  }

  setThumbsFilter(value: ThumbsFilter) {
    this.thumbs.set(value);
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
