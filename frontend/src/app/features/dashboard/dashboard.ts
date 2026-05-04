import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import {
  PortfolioRepository,
  Portfolio,
  Asset,
  OwnedTicker,
} from '../../core/portfolio.repository';
import { AnalysisRepository, Recommendation } from '../../core/analysis.repository';
import { WatchlistEntry, WatchlistRepository } from '../../core/watchlist.repository';

@Component({
  selector: 'app-dashboard',
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly portfolioRepository = inject(PortfolioRepository);
  private readonly analysisRepository = inject(AnalysisRepository);
  private readonly watchlistRepository = inject(WatchlistRepository);
  private readonly translate = inject(TranslateService);
  private pollSub?: Subscription;
  private timerSub?: Subscription;

  portfolios = signal<Portfolio[]>([]);
  selectedPortfolio = signal<Portfolio | null>(null);
  assets = signal<Asset[]>([]);
  /**
   * Distinct tickers across all portfolios — populated alongside `portfolios` on init via the
   * dedicated backend aggregate endpoint. Drives the "Tickers détenus" sidebar shortcut.
   */
  ownedTickers = signal<OwnedTicker[]>([]);
  /** Tickers tracked outside the portfolio. Driven by `WatchlistRepository`. */
  watchlist = signal<WatchlistEntry[]>([]);
  /** Bound to the sidebar input ; cleared after a successful add. */
  watchlistInput = signal('');
  /** True while a POST is in flight ; disables the input + button to prevent double-submit. */
  watchlistAdding = signal(false);
  /** Surfaces add / remove errors next to the watchlist input. */
  watchlistError = signal<string | null>(null);

  // ---- Sidebar accordion state ----
  // Three independent open/close toggles so the user can keep their preferred sections expanded
  // — the portfolio list grows long when many CSVs are imported, and folding it uncovers the
  // ownedTickers / watchlist shortcuts without scrolling.
  portfoliosOpen = signal(true);
  ownedTickersOpen = signal(true);
  watchlistOpen = signal(true);

  loading = signal(false);
  analyzing = signal(false);
  analyzeElapsed = signal(0);
  error = signal<string | null>(null);
  lastRecommendation = signal<Recommendation | null>(null);

  /** Total en CAD du portefeuille sélectionné (bookValueCad toujours en CAD). */
  totalPortfolioValueCad = computed(() =>
    this.assets().reduce((sum, a) => sum + a.bookValueCad, 0),
  );

  /** Grand total en CAD agrégé sur tous les portefeuilles — affiché dans la sidebar. */
  grandTotalCad = computed(() =>
    this.portfolios().reduce((sum, p) => sum + p.totalBookValueCad, 0),
  );

  ngOnInit() {
    this.loadPortfolios();
    this.loadOwnedTickers();
    this.loadWatchlist();
  }

  loadPortfolios() {
    this.loading.set(true);
    this.portfolioRepository.getAll().subscribe({
      next: (portfolios) => {
        this.portfolios.set(portfolios);
        if (portfolios.length > 0 && !this.selectedPortfolio()) {
          this.selectPortfolio(portfolios[0]);
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('dashboard.errors.loadPortfolios'));
        this.loading.set(false);
      },
    });
  }

  /**
   * Loaded once on init and not refreshed on portfolio change — the underlying data
   * (positions across portfolios) only changes on CSV import, which goes through `/import` and
   * eventually navigates away from the dashboard. A silent failure here doesn't surface an error
   * banner ; the sidebar shortcut just stays empty.
   */
  private loadOwnedTickers() {
    this.portfolioRepository.getOwnedTickers().subscribe({
      next: (tickers) => this.ownedTickers.set(tickers),
      error: () => this.ownedTickers.set([]),
    });
  }

  /**
   * Loaded once on init. Silent failure : the watchlist section just stays empty rather than
   * showing a scary error banner — same philosophy as `loadOwnedTickers`. Adds and removes have
   * their own narrow error surface (`watchlistError`).
   */
  private loadWatchlist() {
    this.watchlistRepository.list().subscribe({
      next: (entries) => this.watchlist.set(entries),
      error: () => this.watchlist.set([]),
    });
  }

  /**
   * Adds the symbol currently in the input to the watchlist. The backend is idempotent — POSTing
   * an existing symbol returns the existing entry — so the UI doesn't need to check existence
   * first ; it just refreshes the local list from the response.
   */
  addToWatchlist() {
    const raw = this.watchlistInput().trim();
    if (!raw || this.watchlistAdding()) return;
    this.watchlistAdding.set(true);
    this.watchlistError.set(null);
    this.watchlistRepository.add(raw).subscribe({
      next: (entry) => {
        // Replace any previous entry with the same symbol (the backend's idempotent add returns
        // the existing row when a duplicate is posted), then append. Sorted by addedAt ASC to
        // match the backend's `findAllByOrderByAddedAtAsc` ordering.
        const next = this.watchlist().filter((e) => e.symbol !== entry.symbol);
        next.push(entry);
        this.watchlist.set(next);
        this.watchlistInput.set('');
        this.watchlistAdding.set(false);
      },
      error: (err: { status?: number }) => {
        const key =
          err.status === 400
            ? 'dashboard.watchlist.errors.invalid'
            : 'dashboard.watchlist.errors.add';
        this.watchlistError.set(this.translate.instant(key));
        this.watchlistAdding.set(false);
      },
    });
  }

  /**
   * Optimistic remove : the entry disappears from the list immediately, then we wait for the
   * server to confirm. On 404 (server out of sync) or any error we restore the entry and show
   * an error so the user knows their click didn't take.
   */
  removeFromWatchlist(symbol: string) {
    const before = this.watchlist();
    this.watchlist.set(before.filter((e) => e.symbol !== symbol));
    this.watchlistError.set(null);
    this.watchlistRepository.remove(symbol).subscribe({
      error: () => {
        this.watchlist.set(before);
        this.watchlistError.set(this.translate.instant('dashboard.watchlist.errors.remove'));
      },
    });
  }

  selectPortfolio(portfolio: Portfolio) {
    this.selectedPortfolio.set(portfolio);
    this.lastRecommendation.set(null);
    this.portfolioRepository.getAssets(portfolio.id).subscribe({
      next: (assets) => this.assets.set(assets),
      error: () => this.error.set(this.translate.instant('dashboard.errors.loadAssets')),
    });
  }

  runAnalysis() {
    const portfolio = this.selectedPortfolio();
    if (!portfolio || this.analyzing()) return;
    this.analyzing.set(true);
    this.analyzeElapsed.set(0);
    this.lastRecommendation.set(null);

    this.timerSub = new Subscription();
    const timerInterval = setInterval(() => this.analyzeElapsed.update((v) => v + 1), 1000);
    this.timerSub.add(() => clearInterval(timerInterval));

    this.analysisRepository.startAnalysis(portfolio.id).subscribe({
      next: (job) => {
        this.pollSub = this.analysisRepository.pollJob(portfolio.id, job.jobId).subscribe({
          next: (updatedJob) => {
            if (updatedJob.status === 'DONE' && updatedJob.recommendationId) {
              this.analysisRepository
                .getRecommendation(portfolio.id, updatedJob.recommendationId)
                .subscribe({
                  next: (rec) => {
                    this.lastRecommendation.set(rec);
                    this.stopAnalyzing();
                  },
                });
            } else if (updatedJob.status === 'ERROR') {
              this.error.set(
                this.translate.instant('dashboard.errors.ai', { error: updatedJob.error }),
              );
              this.stopAnalyzing();
            }
          },
          error: (err: Error) => {
            this.error.set(err.message ?? this.translate.instant('dashboard.errors.polling'));
            this.stopAnalyzing();
          },
        });
      },
      error: () => {
        this.error.set(this.translate.instant('dashboard.errors.startAnalysis'));
        this.stopAnalyzing();
      },
    });
  }

  private stopAnalyzing() {
    this.analyzing.set(false);
    this.timerSub?.unsubscribe();
    this.pollSub?.unsubscribe();
  }

  ngOnDestroy() {
    this.stopAnalyzing();
  }

  clearError() {
    this.error.set(null);
  }

  actionClass(action: string): string {
    return (
      { BUY: 'action-buy', SELL: 'action-sell', HOLD: 'action-hold', REDUCE: 'action-reduce' }[
        action
      ] ?? ''
    );
  }

  actionAmounts(
    ticker: string,
    targetWeight: number | null,
  ): {
    targetAmount: number;
    currentValue: number;
    currentWeight: number;
    delta: number;
    currency: string;
  } | null {
    if (targetWeight === null) return null;
    const totalCad = this.totalPortfolioValueCad();
    if (totalCad === 0) return null;
    const asset = this.assets().find((a) => a.ticker === ticker);
    const currentValue = asset?.bookValueCad ?? 0;
    const currentWeight = (currentValue / totalCad) * 100;
    const targetAmount = (targetWeight / 100) * totalCad;
    const delta = targetAmount - currentValue;
    return { targetAmount, currentValue, currentWeight, delta, currency: 'CAD' };
  }
}
