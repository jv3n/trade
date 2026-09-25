import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PatternsRepository } from '../../core/api/patterns/patterns.repository';
import { LanguageService } from '../../core/app-state/language.service';
import { PatternsPage } from './patterns-page';

/**
 * Pins the Patterns page (#419) — the files of `docs/pattern/` and `docs/notes/`, read-only :
 *
 * - a tab per folder, each an accordion of one panel per file, in order ; GUS open ;
 * - the collapsed header carries the file's title and revision date — « never revised » without ;
 * - a link to a file of the other folder switches tab and opens that panel ;
 * - a file that fails to load costs its own panel, never the page.
 */
describe('PatternsPage', () => {
  let markdown: (folder: string, file: string, lang: string) => Observable<string>;
  const lang = signal<'fr' | 'en'>('en');

  beforeEach(() => {
    markdown = (folder, file) => of(source(folder, file));
    lang.set('en');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        { provide: LanguageService, useValue: { lang } },
        {
          provide: PatternsRepository,
          useValue: {
            markdown: (folder: string, file: string, lang: string) => markdown(folder, file, lang),
          },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  async function setup(): Promise<ComponentFixture<PatternsPage>> {
    const fixture = TestBed.createComponent(PatternsPage);
    await fixture.whenStable();
    return fixture;
  }

  const titles = (fixture: ComponentFixture<PatternsPage>) =>
    [...fixture.nativeElement.querySelectorAll('.sheet-title')].map((e: Element) => e.textContent);

  it('opens on the patterns, in the order of the Pattern menu, GUS open', async () => {
    const fixture = await setup();

    expect(titles(fixture)).toEqual(['GUS', 'DT', 'SIR', 'SIV', 'penny-break']);
    expect([...fixture.componentInstance.open()]).toEqual(['sheet-pattern-GUS']);
  });

  it('keeps the notes in a tab of their own', async () => {
    const fixture = await setup();

    expect(fixture.componentInstance.sheets().notes.map((s) => s.file)).toEqual([
      'execution-signals',
      'four-sellers',
      'stop-rule',
    ]);
  });

  it('dates each sheet, and calls one without a revision line never revised', async () => {
    const fixture = await setup();
    const revised = [...fixture.nativeElement.querySelectorAll('.sheet-revised')].map(
      (e: Element) => e.textContent?.trim(),
    );

    // The specs run without translations : the key stands for the label, after the icon's name.
    expect(revised[0]).toMatch(/patternSheets\.revisedOn$/);
    expect(revised[3]).toMatch(/patternSheets\.neverRevised$/);
  });

  it('switches to the notes tab and opens the note a link points at', async () => {
    const fixture = await setup();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector(
      'a[href="#sheet-notes-four-sellers"]',
    );

    link.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.tab()).toBe(1);
    expect(fixture.componentInstance.open().has('sheet-notes-four-sellers')).toBe(true);
  });

  it('reads the French twin of each file when the interface is in French', async () => {
    lang.set('fr');
    const asked: string[] = [];
    markdown = (folder, file, lang) => {
      asked.push(lang);
      return of(source(folder, file));
    };
    await setup();

    expect(asked).toHaveLength(8);
    expect(new Set(asked)).toEqual(new Set(['fr']));
  });

  // A file renamed, removed or a twin never written : its panel says so, the page stays readable.
  it('marks a file that fails to load as unreadable, and still shows the others', async () => {
    markdown = (folder, file) =>
      file === 'four-sellers' ? throwError(() => new Error('404')) : of(source(folder, file));
    const fixture = await setup();
    const notes = fixture.componentInstance.sheets().notes;

    expect(notes.map((s) => s.unreadable ?? false)).toEqual([false, true, false]);
    expect(fixture.componentInstance.sheets().pattern).toHaveLength(5);
    expect(fixture.nativeElement.querySelector('mat-tab-group')).not.toBeNull();
  });
});

function source(folder: string, file: string): string {
  const revised = file === 'SIV' ? '' : '*Last revised : 2026-09-25.*\n\n';
  const link =
    folder === 'pattern' ? 'Judged with [the four sellers](../notes/four-sellers.md).' : '';
  return `# ${file}\n\n> The ${file} summary.\n\n${revised}---\n\n${link}`;
}
