import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LexiconEntry } from '../../core/api/lexicon/lexicon.model';
import { LexiconRepository } from '../../core/api/lexicon/lexicon.repository';
import { LanguageService } from '../../core/app-state/language.service';
import { LexiconPage } from './lexicon-page';

/**
 * Pins the reading view of the glossary (#253) : search and the letter index combine, the index
 * offers only letters that have entries, the FR / EN toggle is local and never writes back to the
 * app locale, and the page reaches no write endpoint.
 */
describe('LexiconPage', () => {
  let findAll: ReturnType<typeof vi.fn>;
  let languageSet: ReturnType<typeof vi.fn>;
  let rows: LexiconEntry[];

  beforeEach(async () => {
    rows = [
      entry({ id: '1', term: 'Double Top (DT)', fr: 'Deux sommets', en: 'Two tops' }),
      entry({ id: '2', term: 'Borrow fee', fr: "Coût d'emprunt", en: 'Cost of borrowing' }),
      entry({ id: '3', term: 'GUS', fr: 'Gap up short', en: 'Gap up short' }),
      entry({
        id: '4',
        term: '% of Total Equity @ Risk',
        fr: 'Capital à risque',
        en: 'Equity at risk',
      }),
    ];
    findAll = vi.fn(() => of(rows));
    languageSet = vi.fn();

    await TestBed.configureTestingModule({
      imports: [LexiconPage],
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        { provide: LexiconRepository, useValue: { findAll } as unknown as LexiconRepository },
        {
          provide: LanguageService,
          useValue: { supported: ['fr', 'en'] as const, lang: signal('fr'), set: languageSet },
        },
      ],
    }).compileComponents();
  });

  it('offers only the initials that have entries, and gathers the rest under one bucket', () => {
    const page = TestBed.createComponent(LexiconPage).componentInstance;

    // B (Borrow fee), D (Double Top), G (GUS), # (« % of Total Equity »). No dead letters.
    expect(page.letters()).toEqual(['#', 'B', 'D', 'G']);
  });

  // #314 : the grid read « Average », « EOD », « LOD », « Average Push » — sorting and the A-Z
  // index ran on the stored term while the card shows the acronym.
  it('orders and files an acronym under the heading the card shows', () => {
    rows.push(
      entry({ id: '5', term: 'Average End of Day (EOD)', fr: 'Moyenne EOD', en: 'Average EOD' }),
      entry({ id: '6', term: 'Average Push', fr: 'Push moyen', en: 'Average push' }),
    );
    const page = TestBed.createComponent(LexiconPage).componentInstance;

    expect(page.visible().map((c) => c.heading)).toEqual([
      '% of Total Equity @ Risk',
      'Average Push',
      'Borrow fee',
      'DT',
      'EOD',
      'GUS',
    ]);
    // E for the acronym, not A for « Average End of Day ».
    expect(page.letters()).toContain('E');
  });

  it('finds a card by the words its acronym stands for', () => {
    const page = TestBed.createComponent(LexiconPage).componentInstance;

    page.setSearch('double top');

    expect(page.visible().map((c) => c.heading)).toEqual(['DT']);
  });

  it('narrows to one letter, and typing widens back to every letter', () => {
    const page = TestBed.createComponent(LexiconPage).componentInstance;

    page.setLetter('B');
    expect(page.visible().map((c) => c.term)).toEqual(['Borrow fee']);

    // Otherwise a letter and a search that exclude each other leave an empty grid with no way to
    // tell which one is to blame.
    page.setSearch('gus');
    expect(page.letter()).toBe(page.allLetters);
    expect(page.visible().map((c) => c.heading)).toEqual(['GUS']);
  });

  it('starts on the app language and swaps the definitions without touching it', () => {
    const page = TestBed.createComponent(LexiconPage).componentInstance;

    expect(page.definitionLanguage()).toBe('fr');
    expect(page.visible().find((c) => c.heading === 'DT')?.definition).toBe('Deux sommets');

    page.setDefinitionLanguage('en');

    expect(page.visible().find((c) => c.heading === 'DT')?.definition).toBe('Two tops');
    expect(languageSet).not.toHaveBeenCalled();
  });

  it('surfaces a load failure instead of showing an empty glossary', () => {
    findAll.mockReturnValue(throwError(() => new Error('boom')));
    const page = TestBed.createComponent(LexiconPage).componentInstance;

    expect(page.error()).toBeTruthy();
    expect(page.loading()).toBe(false);
  });

  function entry(o: { id: string; term: string; fr: string; en: string }): LexiconEntry {
    return { id: o.id, term: o.term, definitionFr: o.fr, definitionEn: o.en };
  }
});
