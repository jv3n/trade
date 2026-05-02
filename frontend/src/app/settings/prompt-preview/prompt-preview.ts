import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { PortfolioService, Portfolio } from '../../core/portfolio.service';
import { AnalysisService, PromptPreview } from '../../core/analysis.service';

@Component({
  selector: 'app-prompt-preview',
  imports: [CommonModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './prompt-preview.html',
  styleUrl: './prompt-preview.scss',
})
export class PromptPreviewPage implements OnInit {
  private readonly portfolioService = inject(PortfolioService);
  private readonly analysisService = inject(AnalysisService);

  portfolios = signal<Portfolio[]>([]);
  selectedId = signal<string | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  preview = signal<PromptPreview | null>(null);

  ngOnInit() {
    this.portfolioService.getAll().subscribe({
      next: (list) => this.portfolios.set(list),
    });
  }

  selectPortfolio(id: string) {
    this.selectedId.set(id || null);
    this.preview.set(null);
    this.error.set(null);
  }

  load() {
    const id = this.selectedId();
    if (!id || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.preview.set(null);

    this.analysisService.getPromptPreview(id).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.status === 404 ? 'Portefeuille introuvable' : 'Erreur backend');
        this.loading.set(false);
      },
    });
  }

  copy(text: string) {
    navigator.clipboard?.writeText(text);
  }
}
