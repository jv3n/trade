import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe, NgClass, PercentPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PromptRepository, PromptStats, PromptTemplate } from '../../../../core/prompt.repository';

/**
 * Settings → Prompts → Stats (Phase 3 PR6). Per-prompt aggregated view :
 *
 * - **KPI cards** at the top — total runs, latency p50 / p95, retry rate, parse-failed rate,
 *   validator-failed rate, thumbs balance (👍 − 👎). One scan tells the user whether this
 *   prompt is healthy vs the previous version.
 * - **Latency sparkline** (SVG, no chart lib) — last 90 days, one point per day with runs.
 *   Missing days show as gaps, not zeros, so the line doesn't suggest scoring activity that
 *   didn't happen.
 * - **Thumbs distribution bar** — horizontal stacked bar of up / neutral / down, with the
 *   counts as a legend.
 * - **Daily table** — fallback for the eye that prefers numbers ; one row per day with runs +
 *   p50 + thumbs polarity.
 *
 * The page also fetches the [PromptTemplate] row so the header can show version + chip — saves
 * a back-link round trip to read the version label.
 */
@Component({
  selector: 'app-prompt-stats',
  imports: [
    DecimalPipe,
    NgClass,
    PercentPipe,
    RouterLink,
    MatProgressSpinnerModule,
    MatIconModule,
    TranslatePipe,
  ],
  templateUrl: './prompt-stats.html',
  styleUrl: './prompt-stats.scss',
})
export class PromptStatsPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly repo = inject(PromptRepository);
  private readonly translate = inject(TranslateService);

  promptId = signal<string>('');
  template = signal<PromptTemplate | null>(null);
  stats = signal<PromptStats | null>(null);
  loading = signal(true);
  loadError = signal<string | null>(null);

  /** True when the prompt exists but no `prompt_score` row was written yet. */
  isEmpty = computed(() => {
    const s = this.stats();
    return s !== null && s.totalRuns === 0;
  });

  /**
   * SVG `<polyline>` `points` attribute for the latency p50 sparkline. Coordinates are mapped
   * into a fixed 600×120 viewBox — the SVG itself scales to its container via `width=100%`.
   * Returns `null` when there's nothing meaningful to draw (≤ 1 data point, or every day has
   * null latency).
   */
  latencyPolyline = computed<string | null>(() => {
    const s = this.stats();
    if (!s || s.daily.length === 0) return null;
    // Daily is reverse-chronological from the backend ; flip for left-to-right time on screen.
    const days = [...s.daily].reverse().filter((d) => d.latencyP50Ms !== null);
    if (days.length < 2) return null;
    const ys = days.map((d) => d.latencyP50Ms as number);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const yRange = yMax - yMin || 1;
    const w = SPARK_WIDTH;
    const h = SPARK_HEIGHT;
    const stepX = w / (days.length - 1);
    return days
      .map((d, i) => {
        const x = i * stepX;
        const y = h - (((d.latencyP50Ms as number) - yMin) / yRange) * h;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  /** Width of each thumbs segment as a percentage of the total bar — kept ≥ 0 even on empty. */
  thumbsSegmentPct(part: 'up' | 'down' | 'neutral'): number {
    const s = this.stats();
    if (!s || s.totalRuns === 0) return 0;
    return (s.thumbs[part] / s.totalRuns) * 100;
  }

  /** Net thumbs balance (up − down) — surfaces directional feedback without privileging a 0 over a 50/50 split. */
  thumbsBalance = computed<number>(() => {
    const s = this.stats();
    if (!s) return 0;
    return s.thumbs.up - s.thumbs.down;
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.promptId.set(id);
    if (!id) {
      this.loadError.set(this.translate.instant('settings.promptsPage.stats.errors.missingId'));
      this.loading.set(false);
      return;
    }
    this.loadAll(id);
  }

  /** Re-fetch both the template + stats — public so the « Refresh » button can call it. */
  loadAll(id: string) {
    this.loading.set(true);
    this.loadError.set(null);
    let templateLoaded = false;
    let statsLoaded = false;
    const done = () => {
      if (templateLoaded && statsLoaded) this.loading.set(false);
    };

    this.repo.get(id).subscribe({
      next: (t) => {
        this.template.set(t);
        templateLoaded = true;
        done();
      },
      error: () => {
        this.template.set(null);
        templateLoaded = true;
        // A missing template is the load error — stats are uninteresting without one.
        this.loadError.set(this.translate.instant('settings.promptsPage.stats.errors.load'));
        done();
      },
    });
    this.repo.getStats(id).subscribe({
      next: (s) => {
        this.stats.set(s);
        statsLoaded = true;
        done();
      },
      error: () => {
        this.stats.set(null);
        statsLoaded = true;
        this.loadError.set(this.translate.instant('settings.promptsPage.stats.errors.load'));
        done();
      },
    });
  }
}

// SVG viewBox dimensions — exported (well, module-scoped const) so the template can mirror them
// via getter or the spec can reference them. Kept off the component to stay pure constants.
const SPARK_WIDTH = 600;
const SPARK_HEIGHT = 120;
export const SPARK_VIEWBOX = `0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`;
