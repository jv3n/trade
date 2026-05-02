import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { PortfolioRepository, Portfolio, Asset } from '../../core/portfolio.repository';
import { AnalysisRepository, Recommendation } from '../../core/analysis.repository';

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
  private readonly translate = inject(TranslateService);
  private pollSub?: Subscription;
  private timerSub?: Subscription;

  portfolios = signal<Portfolio[]>([]);
  selectedPortfolio = signal<Portfolio | null>(null);
  assets = signal<Asset[]>([]);
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
