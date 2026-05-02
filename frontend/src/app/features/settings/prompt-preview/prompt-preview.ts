import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PortfolioRepository, Portfolio } from '../../../core/portfolio.repository';
import { AnalysisRepository, PromptPreview } from '../../../core/analysis.repository';

@Component({
  selector: 'app-prompt-preview',
  imports: [CommonModule, MatProgressSpinnerModule, MatIconModule, TranslatePipe],
  templateUrl: './prompt-preview.html',
  styleUrl: './prompt-preview.scss',
})
export class PromptPreviewPage implements OnInit {
  private readonly portfolioRepository = inject(PortfolioRepository);
  private readonly analysisRepository = inject(AnalysisRepository);
  private readonly translate = inject(TranslateService);

  portfolios = signal<Portfolio[]>([]);
  selectedId = signal<string | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  preview = signal<PromptPreview | null>(null);

  ngOnInit() {
    this.portfolioRepository.getAll().subscribe({
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

    this.analysisRepository.getPromptPreview(id).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.loading.set(false);
      },
      error: (err) => {
        const key =
          err?.status === 404
            ? 'settings.previewPage.errors.notFound'
            : 'settings.previewPage.errors.backend';
        this.error.set(this.translate.instant(key));
        this.loading.set(false);
      },
    });
  }

  copy(text: string) {
    navigator.clipboard?.writeText(text);
  }
}
