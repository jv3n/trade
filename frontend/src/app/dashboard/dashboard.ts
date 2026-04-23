import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortfolioService, Portfolio, Asset, CreatePortfolioRequest, CreateAssetRequest, AssetType } from '../core/portfolio.service';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly portfolioService = inject(PortfolioService);

  portfolios = signal<Portfolio[]>([]);
  selectedPortfolio = signal<Portfolio | null>(null);
  assets = signal<Asset[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

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
      error: (err) => {
        this.error.set('Erreur lors du chargement des portefeuilles');
        this.loading.set(false);
      }
    });
  }

  selectPortfolio(portfolio: Portfolio) {
    this.selectedPortfolio.set(portfolio);
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

  clearError() {
    this.error.set(null);
  }
}
