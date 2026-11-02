import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LexiconEntry } from '../../../core/api/lexicon/lexicon.model';
import { LanguageService } from '../../../core/app-state/language.service';
import { LexiconTable } from './lexicon-table';

/**
 * Pins [LexiconTable], the presentational table behind `/lexicon` and `/settings/lexicon` :
 *
 *  - **The search reads everything** : term and both definitions, whatever the language shown,
 *    ignoring case and the spaces around the query.
 *  - **The definition follows the interface language** ; both are always there.
 *  - **The actions only exist in [editable] mode**, and they hand the row to the host : the table
 *    loads and changes nothing itself.
 *
 * The specs read the rendered rows : a filter that is right in the `computed` but wrong on screen is
 * the failure that matters.
 */
describe('LexiconTable', () => {
  const FLOAT = makeEntry({
    id: 'float',
    term: 'Float',
    definitionFr: 'Actions disponibles à la négociation',
    definitionEn: 'Shares available for trading',
  });
  const GAP = makeEntry({
    id: 'gap',
    term: 'Gap',
    definitionFr: 'Écart entre la clôture et l’ouverture',
    definitionEn: 'Difference between the close and the open',
  });

  let lang: WritableSignal<string>;
  let fixture: ComponentFixture<LexiconTable>;

  function makeEntry(overrides: Partial<LexiconEntry> = {}): LexiconEntry {
    return {
      id: 'float',
      term: 'Float',
      definitionFr: 'Actions disponibles à la négociation',
      definitionEn: 'Shares available for trading',
      ...overrides,
    };
  }

  function dom(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function terms(): string[] {
    return Array.from(dom().querySelectorAll('.term-cell')).map(
      (cell) => cell.textContent?.trim() ?? '',
    );
  }

  function action(key: 'edit' | 'delete'): HTMLButtonElement | null {
    return dom().querySelector(`button[aria-label="lexicon.actions.${key}"]`);
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function render(editable = false): Promise<void> {
    fixture = TestBed.createComponent(LexiconTable);
    fixture.componentRef.setInput('entries', [FLOAT, GAP]);
    fixture.componentRef.setInput('editable', editable);
    await settle();
  }

  async function search(query: string): Promise<void> {
    const input = dom().querySelector('input') as HTMLInputElement;
    input.value = query;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  beforeEach(async () => {
    lang = signal('fr');

    await TestBed.configureTestingModule({
      imports: [LexiconTable],
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        { provide: LanguageService, useValue: { lang } },
      ],
    }).compileComponents();
  });

  it('lists every entry until a query is typed', async () => {
    await render();

    expect(terms()).toEqual(['Float', 'Gap']);
  });

  it('finds a term whatever the case', async () => {
    await render();

    await search('GAP');

    expect(terms()).toEqual(['Gap']);
  });

  it('finds a word of the French definition while the interface is in English', async () => {
    lang.set('en');
    await render();

    await search('négociation');

    expect(terms()).toEqual(['Float']);
  });

  it('finds a word of the English definition while the interface is in French', async () => {
    await render();

    await search('difference');

    expect(terms()).toEqual(['Gap']);
  });

  it('ignores the spaces around the query', async () => {
    await render();

    await search('  float  ');

    expect(terms()).toEqual(['Float']);
  });

  it('treats a query of spaces as no query', async () => {
    await render();

    await search('   ');

    expect(terms()).toEqual(['Float', 'Gap']);
  });

  it('replaces the table with the empty state when nothing matches', async () => {
    await render();

    await search('squeeze');

    expect(dom().querySelector('table')).toBeNull();
    expect(dom().querySelector('.empty-state')).not.toBeNull();
  });

  it('shows the French definition in French', async () => {
    await render();

    expect(dom().textContent).toContain(FLOAT.definitionFr);
    expect(dom().textContent).not.toContain(FLOAT.definitionEn);
  });

  it('shows the English definition in English', async () => {
    lang.set('en');
    await render();

    expect(dom().textContent).toContain(FLOAT.definitionEn);
    expect(dom().textContent).not.toContain(FLOAT.definitionFr);
  });

  it('offers no action when read-only', async () => {
    await render();

    expect(action('edit')).toBeNull();
    expect(action('delete')).toBeNull();
  });

  it('hands the row to the host when asked to edit it', async () => {
    await render(true);
    const edited = vi.fn();
    fixture.componentInstance.editEntry.subscribe(edited);

    action('edit')?.click();

    expect(edited).toHaveBeenCalledWith(FLOAT);
  });

  it('hands the row to the host when asked to delete it', async () => {
    await render(true);
    const deleted = vi.fn();
    fixture.componentInstance.deleteEntry.subscribe(deleted);

    action('delete')?.click();

    expect(deleted).toHaveBeenCalledWith(FLOAT);
  });
});
