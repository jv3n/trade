import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { OwnedTicker, PortfolioRepository } from '../../../core/portfolio.repository';
import { MarketRepository, NarrativePromptPreview } from '../../../core/market.repository';

/**
 * Settings → Prompt preview. Phase 1 narrative pipeline preview : pick a ticker (any owned
 * symbol or a free-text input), see the exact system + user prompt the runner would send to
 * Claude/Ollama, **without** firing the LLM. The legacy Phase 0 portfolio preview lives elsewhere
 * (frozen) ; this page now serves the active narrative pipeline only.
 */
@Component({
  selector: 'app-prompt-preview',
  imports: [CommonModule, MatProgressSpinnerModule, MatIconModule, TranslatePipe],
  templateUrl: './prompt-preview.html',
  styleUrl: './prompt-preview.scss',
})
export class PromptPreviewPage implements OnInit {
  private readonly portfolioRepository = inject(PortfolioRepository);
  private readonly marketRepository = inject(MarketRepository);
  private readonly translate = inject(TranslateService);

  /** Suggestions populated from the user's owned tickers ; the user can also type a free symbol. */
  ownedTickers = signal<OwnedTicker[]>([]);
  symbolInput = signal<string>('');
  loading = signal(false);
  error = signal<string | null>(null);
  preview = signal<NarrativePromptPreview | null>(null);

  ngOnInit() {
    this.portfolioRepository.getOwnedTickers().subscribe({
      next: (list) => this.ownedTickers.set(list),
      // Silent : the input still works without suggestions.
      error: () => this.ownedTickers.set([]),
    });
  }

  setSymbol(s: string) {
    this.symbolInput.set(s.trim().toUpperCase());
    this.preview.set(null);
    this.error.set(null);
  }

  load() {
    const symbol = this.symbolInput();
    if (!symbol || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.preview.set(null);

    this.marketRepository.getNarrativePromptPreview(symbol).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.loading.set(false);
      },
      error: (err) => {
        const key =
          err?.status === 404
            ? 'settings.previewPage.errors.notFound'
            : err?.status === 503
              ? 'settings.previewPage.errors.unavailable'
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
