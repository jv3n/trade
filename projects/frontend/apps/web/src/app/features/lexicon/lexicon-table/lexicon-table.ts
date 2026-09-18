import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbTableModule,
  StbTooltipModule,
} from '@portfolioai/ui';
import { LexiconEntry } from '../../../core/api/lexicon/lexicon.model';
import { LanguageService } from '../../../core/app-state/language.service';

/**
 * Presentational lexicon table — search box + Material table over a given [entries] list. Owns the
 * **client-side search** on the term (a `computed` filter, no backend round-trip) ; it does **not**
 * load data or mutate it. The hosting page handles loading / error / truly-empty states and feeds
 * the rows in.
 *
 * Two modes via [editable] :
 *   - `false` (default) — read-only, used by the public `/lexicon` page (every authenticated user).
 *   - `true` — adds an actions column (edit / delete) that emits [editEntry] / [deleteEntry], used
 *     by the ADMIN `/settings/lexicon` page.
 */
@Component({
  selector: 'app-lexicon-table',
  imports: [
    StbButtonModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbTableModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './lexicon-table.html',
  styleUrl: './lexicon-table.scss',
})
export class LexiconTable {
  private readonly language = inject(LanguageService);

  readonly entries = input.required<LexiconEntry[]>();
  readonly editable = input(false);

  readonly editEntry = output<LexiconEntry>();
  readonly deleteEntry = output<LexiconEntry>();

  readonly searchValue = signal('');

  /**
   * Client-side filter — case-insensitive substring on the term and **both** definitions, so search
   * works the same whatever the displayed language ("chercher de partout").
   */
  readonly filtered = computed(() => {
    const q = this.searchValue().trim().toLowerCase();
    const rows = this.entries();
    if (!q) return rows;
    return rows.filter(
      (e) =>
        e.term.toLowerCase().includes(q) ||
        e.definitionFr.toLowerCase().includes(q) ||
        e.definitionEn.toLowerCase().includes(q),
    );
  });

  readonly columns = computed<readonly string[]>(() =>
    this.editable() ? ['term', 'definition', 'actions'] : ['term', 'definition'],
  );

  /** The definition to show for a row, picked by the active UI language (both are always present). */
  definitionFor(e: LexiconEntry): string {
    return this.language.lang() === 'en' ? e.definitionEn : e.definitionFr;
  }

  onSearchInput(value: string): void {
    this.searchValue.set(value);
  }

  clearSearch(): void {
    this.searchValue.set('');
  }
}
