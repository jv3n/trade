import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MarketRepository, TickerSnapshot } from '../../../core/market.repository';
import { OwnedTicker, PortfolioRepository } from '../../../core/portfolio.repository';
import {
  SettingsRepository,
  DataSource,
  SourceCategory,
  SourceTestResult,
} from '../../../core/settings.repository';

const CATEGORY_ORDER: SourceCategory[] = ['RSS', 'MARKET', 'MACRO', 'CRYPTO'];

/**
 * Result of a Yahoo ticker fetch test — distinct shape from `SourceTestResult` because the
 * inputs (price, indicators count, bars count) are completely different from RSS articles.
 */
interface TickerFetchResult {
  ok: boolean;
  symbol: string;
  errorKey: string | null;
  /** Snapshot loaded from the market endpoint when ok = true. */
  snapshot: TickerSnapshot | null;
}

@Component({
  selector: 'app-test-sources',
  imports: [CommonModule, MatProgressSpinnerModule, MatIconModule, TranslatePipe],
  templateUrl: './test-sources.html',
  styleUrl: './test-sources.scss',
})
export class TestSources implements OnInit {
  private readonly settingsRepository = inject(SettingsRepository);
  private readonly marketRepository = inject(MarketRepository);
  private readonly portfolioRepository = inject(PortfolioRepository);
  private readonly translate = inject(TranslateService);

  allSources = signal<DataSource[]>([]);
  selectedCategory = signal<SourceCategory | null>(null);
  selectedId = signal<string | null>(null);
  testing = signal(false);
  result = signal<SourceTestResult | null>(null);

  // ---- Ticker fetch test (Phase 1 — Yahoo) ----

  ownedTickers = signal<OwnedTicker[]>([]);
  tickerInput = signal<string>('');
  tickerTesting = signal(false);
  tickerResult = signal<TickerFetchResult | null>(null);

  categories = CATEGORY_ORDER;

  sourcesForCategory = computed(() => {
    const cat = this.selectedCategory();
    if (!cat) return [];
    return this.allSources().filter((s) => s.category === cat && s.enabled);
  });

  selectedSource = computed(
    () => this.allSources().find((s) => s.id === this.selectedId()) ?? null,
  );

  ngOnInit() {
    this.settingsRepository.getSources().subscribe({
      next: (sources) => this.allSources.set(sources),
    });
    this.portfolioRepository.getOwnedTickers().subscribe({
      next: (list) => this.ownedTickers.set(list),
      error: () => this.ownedTickers.set([]),
    });
  }

  selectCategory(category: string) {
    this.selectedCategory.set((category as SourceCategory) || null);
    this.selectedId.set(null);
    this.result.set(null);
  }

  selectSource(id: string) {
    this.selectedId.set(id || null);
    this.result.set(null);
  }

  test() {
    const id = this.selectedId();
    if (!id || this.testing()) return;
    this.testing.set(true);
    this.result.set(null);

    this.settingsRepository.testSource(id).subscribe({
      next: (r) => {
        this.result.set(r);
        this.testing.set(false);
      },
      error: () => {
        this.result.set({
          ok: false,
          error: this.translate.instant('settings.testPage.errorBackend'),
          message: null,
          itemCount: 0,
          items: [],
        });
        this.testing.set(false);
      },
    });
  }

  // ---- Ticker fetch test ----

  setTicker(s: string) {
    this.tickerInput.set(s.trim().toUpperCase());
    this.tickerResult.set(null);
  }

  /**
   * Tests the Yahoo (or mock) chart fetch for a symbol. Success = symbol resolves, indicators
   * computed, bars returned. Useful in dev to confirm a ticker exists in the upstream before
   * trying to generate a narrative for it.
   */
  testTicker() {
    const symbol = this.tickerInput();
    if (!symbol || this.tickerTesting()) return;
    this.tickerTesting.set(true);
    this.tickerResult.set(null);

    this.marketRepository.getTicker(symbol).subscribe({
      next: (snapshot) => {
        this.tickerResult.set({ ok: true, symbol, errorKey: null, snapshot });
        this.tickerTesting.set(false);
      },
      error: (err) => {
        const errorKey =
          err?.status === 404
            ? 'settings.testPage.ticker.errorNotFound'
            : err?.status === 503
              ? 'settings.testPage.ticker.errorUnavailable'
              : 'settings.testPage.errorBackend';
        this.tickerResult.set({ ok: false, symbol, errorKey, snapshot: null });
        this.tickerTesting.set(false);
      },
    });
  }
}
