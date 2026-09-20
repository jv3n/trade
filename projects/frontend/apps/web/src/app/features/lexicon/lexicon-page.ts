import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonToggleModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbProgressSpinnerModule,
} from '@portfolioai/ui';

import { LexiconEntry } from '../../core/api/lexicon/lexicon.model';
import { LexiconRepository } from '../../core/api/lexicon/lexicon.repository';
import { Language, LanguageService } from '../../core/app-state/language.service';
import { SplitTerm, indexLetter, splitTerm } from './lexicon-term';

export interface LexiconCard extends SplitTerm {
  id: string;
  term: string;
  definition: string;
  letter: string;
}

/** Sentinel for « no letter selected » — a real letter would collide with a one-letter term. */
export const ALL_LETTERS = '';

/**
 * Read-only glossary, laid out after `mockup/lexique.html` (#253). The dataset is shared, so
 * editing is ADMIN-only on `/settings/lexicon` — this page reaches no write endpoint.
 *
 * Filtering is client-side : the whole glossary arrives in one call.
 */
@Component({
  selector: 'app-lexicon-page',
  imports: [
    StbButtonToggleModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbProgressSpinnerModule,
    TranslatePipe,
  ],
  templateUrl: './lexicon-page.html',
  styleUrl: './lexicon-page.scss',
})
export class LexiconPage {
  private readonly repo = inject(LexiconRepository);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly entries = signal<LexiconEntry[]>([]);

  readonly search = signal('');
  readonly letter = signal(ALL_LETTERS);
  readonly allLetters = ALL_LETTERS;

  readonly languages = this.language.supported;
  /** Seeded from the app locale, then owned by the toggle — it never writes back. */
  readonly definitionLanguage = signal<Language>(this.language.lang());

  private readonly cards = computed<LexiconCard[]>(() => {
    const lang = this.definitionLanguage();
    return this.entries()
      .map((e) => ({
        id: e.id,
        term: e.term,
        definition: lang === 'fr' ? e.definitionFr : e.definitionEn,
        letter: indexLetter(e.term),
        ...splitTerm(e.term),
      }))
      .sort((a, b) => a.term.localeCompare(b.term));
  });

  /** Only the initials that have entries — a dead letter is a dead end. */
  readonly letters = computed(() => [...new Set(this.cards().map((c) => c.letter))].sort());

  /** Search reads the expansion too, so "double top" finds the card headed `DT`. */
  readonly visible = computed<LexiconCard[]>(() => {
    const needle = this.search().trim().toLowerCase();
    const letter = this.letter();
    return this.cards().filter(
      (c) =>
        (letter === ALL_LETTERS || c.letter === letter) &&
        (needle === '' ||
          c.term.toLowerCase().includes(needle) ||
          (c.expansion?.toLowerCase().includes(needle) ?? false)),
    );
  });

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

  setSearch(value: string): void {
    this.search.set(value);
    // A letter and a search that exclude each other leave an empty grid blaming neither.
    this.letter.set(ALL_LETTERS);
  }

  setLetter(letter: string): void {
    this.letter.set(letter);
  }

  setDefinitionLanguage(lang: Language): void {
    this.definitionLanguage.set(lang);
  }
}
