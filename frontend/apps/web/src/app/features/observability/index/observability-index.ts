import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  NarrativeObservabilityRepository,
  TickerObservationIndex,
} from '../../../core/api/analysis/narrative-observability.repository';
import { StbIconModule, StbProgressSpinnerModule } from '@portfolioai/ui';

/**
 * `/observability` — Phase 3 #1 PR3. Landing page that lists every ticker with at least one
 * persisted narrative, so the user can discover what's in their corpus without typing a symbol
 * blindly. Each row links to the per-symbol timeline at `/observability/:symbol`.
 *
 * Ordered most-recent first by `lastGeneratedAt` (backend-sorted — the page preserves the order
 * verbatim). Snapshot count is shown as a small chip so a ticker with 47 narratives stands out
 * from one with 1.
 *
 * **No filters here** — the page is small enough that a single « find a ticker » input would
 * outsize the list itself. If the corpus ever balloons, a search input becomes the natural
 * extension.
 */
@Component({
  selector: 'app-observability-index',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    StbProgressSpinnerModule,
    StbIconModule,
    TranslatePipe,
  ],
  templateUrl: './observability-index.html',
  styleUrl: './observability-index.scss',
})
export class ObservabilityIndexPage implements OnInit {
  private readonly repo = inject(NarrativeObservabilityRepository);
  private readonly translate = inject(TranslateService);

  tickers = signal<TickerObservationIndex[]>([]);
  loading = signal(true);
  loadError = signal<string | null>(null);

  /** True when the load succeeded but the corpus is empty (no narrative has ever been generated). */
  isEmpty = computed(
    () => !this.loading() && this.loadError() === null && this.tickers().length === 0,
  );

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.loadError.set(null);
    this.repo.findTickers().subscribe({
      next: (rows) => {
        this.tickers.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(this.translate.instant('observabilityIndexPage.errors.load'));
        this.loading.set(false);
      },
    });
  }
}
