import { Component, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { StbIconModule, StbProgressSpinnerModule } from '@portfolioai/ui';

import { LexiconEntry } from '../../core/api/lexicon/lexicon.model';
import { LexiconRepository } from '../../core/api/lexicon/lexicon.repository';
import { LexiconTable } from './lexicon-table/lexicon-table';

/**
 * Public trading-lexicon page — a **read-only** glossary reachable from the bottom of the sidenav
 * by every authenticated user. The dataset is shared, so editing lives behind ADMIN on
 * `/settings/lexicon` ; here we only load the entries and hand them to the read-only
 * [LexiconTable] (which owns the client-side term search).
 */
@Component({
  selector: 'app-lexicon-page',
  imports: [StbIconModule, StbProgressSpinnerModule, TranslatePipe, LexiconTable],
  templateUrl: './lexicon-page.html',
  styleUrl: './lexicon-page.scss',
})
export class LexiconPage {
  private readonly repo = inject(LexiconRepository);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly entries = signal<LexiconEntry[]>([]);

  constructor() {
    this.loading.set(true);
    this.repo.findAll().subscribe({
      next: (rows) => {
        this.entries.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('lexicon.errors.load'));
        this.loading.set(false);
      },
    });
  }
}
