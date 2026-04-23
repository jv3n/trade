import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import { PortfolioService, Portfolio, Asset, CreatePortfolioRequest, CreateAssetRequest, AssetType } from '../core/portfolio.service';
import { AnalysisService, Recommendation } from '../core/analysis.service';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly portfolioService = inject(PortfolioService);
  private readonly analysisService = inject(AnalysisService);
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

  showCreatePortfolio = signal(false);
  showAddAsset = signal(false);

  newPortfolio: CreatePortfolioRequest = { name: '', description: '' };
  newAsset: CreateAssetRequest = {
    ticker: '',
    name: '',
    quantity: 0,
    avgBuyPrice: 0,
    assetType: 'STOCK'
  };

  assetTypes: AssetType[] = ['STOCK', 'ETF', 'CRYPTO', 'BOND', 'COMMODITY'];

  totalPortfolioValue = computed(() =>
    this.assets().reduce((sum, a) => sum + a.totalValue, 0)
  );

  ngOnInit() {
    this.loadPortfolios();
  }

  loadPortfolios() {
    this.loading.set(true);
    this.portfolioService.getAll().subscribe({
      next: (portfolios) => {
        this.portfolios.set(portfolios);
        if (portfolios.length > 0 && !this.selectedPortfolio()) {
          this.selectPortfolio(portfolios[0]);
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Erreur lors du chargement des portefeuilles');
        this.loading.set(false);
      }
    });
  }

  selectPortfolio(portfolio: Portfolio) {
    this.selectedPortfolio.set(portfolio);
    this.lastRecommendation.set(null);
    this.portfolioService.getAssets(portfolio.id).subscribe({
      next: (assets) => this.assets.set(assets),
      error: () => this.error.set('Erreur lors du chargement des actifs')
    });
  }

  createPortfolio() {
    if (!this.newPortfolio.name.trim()) return;
    this.portfolioService.create(this.newPortfolio).subscribe({
      next: (p) => {
        this.portfolios.update(list => [...list, p]);
        this.selectPortfolio(p);
        this.showCreatePortfolio.set(false);
        this.newPortfolio = { name: '', description: '' };
      },
      error: () => this.error.set('Erreur lors de la création du portefeuille')
    });
  }

  deletePortfolio(portfolio: Portfolio) {
    this.portfolioService.delete(portfolio.id).subscribe({
      next: () => {
        this.portfolios.update(list => list.filter(p => p.id !== portfolio.id));
        if (this.selectedPortfolio()?.id === portfolio.id) {
          const remaining = this.portfolios();
          this.selectedPortfolio.set(remaining[0] ?? null);
          this.assets.set([]);
          this.lastRecommendation.set(null);
          if (remaining[0]) this.selectPortfolio(remaining[0]);
        }
      },
      error: () => this.error.set('Erreur lors de la suppression')
    });
  }

  addAsset() {
    const portfolio = this.selectedPortfolio();
    if (!portfolio || !this.newAsset.ticker.trim()) return;
    this.portfolioService.addAsset(portfolio.id, this.newAsset).subscribe({
      next: (asset) => {
        this.assets.update(list => [...list, asset]);
        this.portfolios.update(list =>
          list.map(p => p.id === portfolio.id ? { ...p, assetCount: p.assetCount + 1 } : p)
        );
        this.showAddAsset.set(false);
        this.newAsset = { ticker: '', name: '', quantity: 0, avgBuyPrice: 0, assetType: 'STOCK' };
      },
      error: () => this.error.set('Erreur lors de l\'ajout de l\'actif')
    });
  }

  removeAsset(asset: Asset) {
    const portfolio = this.selectedPortfolio();
    if (!portfolio) return;
    this.portfolioService.removeAsset(portfolio.id, asset.id).subscribe({
      next: () => {
        this.assets.update(list => list.filter(a => a.id !== asset.id));
        this.portfolios.update(list =>
          list.map(p => p.id === portfolio.id ? { ...p, assetCount: p.assetCount - 1 } : p)
        );
      },
      error: () => this.error.set('Erreur lors de la suppression de l\'actif')
    });
  }

  runAnalysis() {
    const portfolio = this.selectedPortfolio();
    if (!portfolio || this.analyzing()) return;
    this.analyzing.set(true);
    this.analyzeElapsed.set(0);
    this.lastRecommendation.set(null);

    // Timer d'affichage
    this.timerSub = new Subscription();
    const timerInterval = setInterval(() => this.analyzeElapsed.update(v => v + 1), 1000);
    this.timerSub.add(() => clearInterval(timerInterval));

    this.analysisService.startAnalysis(portfolio.id).subscribe({
      next: (job) => {
        this.pollSub = this.analysisService.pollJob(portfolio.id, job.jobId).subscribe({
          next: (updatedJob) => {
            if (updatedJob.status === 'DONE' && updatedJob.recommendationId) {
              this.analysisService.getRecommendation(portfolio.id, updatedJob.recommendationId).subscribe({
                next: (rec) => {
                  this.lastRecommendation.set(rec);
                  this.stopAnalyzing();
                }
              });
            } else if (updatedJob.status === 'ERROR') {
              this.error.set(`Erreur IA : ${updatedJob.error}`);
              this.stopAnalyzing();
            }
          },
          error: () => {
            this.error.set('Erreur lors du polling du job d\'analyse');
            this.stopAnalyzing();
          }
        });
      },
      error: () => {
        this.error.set('Erreur lors du démarrage de l\'analyse IA');
        this.stopAnalyzing();
      }
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
    return { BUY: 'action-buy', SELL: 'action-sell', HOLD: 'action-hold', REDUCE: 'action-reduce' }[action] ?? '';
  }
}
