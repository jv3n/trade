import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PatternsRepository } from '../../core/api/patterns/patterns.repository';
import { LanguageService } from '../../core/app-state/language.service';
import { PatternsPage } from './patterns-page';

/**
 * Pins the Patterns page (#419) — the files of `docs/pattern/` and `docs/notes/`, read-only :
 *
 * - a tab per folder, each an accordion of one panel per file, in order ; GUS open ;
 * - the collapsed header carries the file's title and revision date — « never revised » without ;
 * - a link to another file switches tab and opens that panel, then scrolls to it once the
 *   animation that moves it has ended — the tab's, or the panel's own on the same tab — instantly
 *   when the reader asks for reduced motion or the browser drops the smooth scroll ;
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

  const scrollIntoView = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

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

  // Scrolled as soon as the link was followed, the panel was still off-screen once the tab and the
  // accordion had finished moving (#424).
  it('brings the linked panel into view once the tab has settled, not before', async () => {
    const scrolled = recordScrolls();
    const fixture = await setup();

    fixture.nativeElement.querySelector('a[href="#sheet-notes-four-sellers"]').click();
    await fixture.whenStable();
    expect(scrolled).toEqual([]);

    // Material's fallback when no CSS transition runs (jsdom) : the tab settles after 100 ms.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await fixture.whenStable();
    expect(scrolled).toEqual(['sheet-notes-four-sellers']);
  });

  // The panel expands while nothing else moves : its own animation is the one to wait for, and
  // another panel opened by hand meanwhile must not trigger the scroll (review of #427).
  it('on the same tab, scrolls once the linked panel has expanded, and on no other', async () => {
    const scrolled = recordScrolls();
    const fixture = await setup();
    const page = fixture.componentInstance;

    fixture.nativeElement.querySelector('a[href="#sheet-pattern-DT"]').click();
    await fixture.whenStable();
    page.settled('tab');
    page.settled('panel', 'sheet-pattern-SIR');
    expect(scrolled).toEqual([]);

    page.settled('panel', 'sheet-pattern-DT');
    page.settled('panel', 'sheet-pattern-DT');
    expect(scrolled).toEqual(['sheet-pattern-DT']);
  });

  describe('the scroll to a linked panel', () => {
    /** Follows the link to DT and lets its panel expand, on a browser behaving as described. */
    async function followToDt(browser: { smoothScrolls: boolean; reducedMotion?: boolean }) {
      vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
        frame(0);
        return 0;
      });
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)' && !!browser.reducedMotion,
      }));
      const fixture = await setup();
      const panel: HTMLElement = fixture.nativeElement.querySelector('#sheet-pattern-DT');
      // Far below the fold, as on staging : the panel sits 2186 px down until a scroll lands it
      // under the 64 px toolbar, where the scroll container starts.
      let top = 2186;
      panel.getBoundingClientRect = () => ({ top }) as DOMRect;
      const behaviors: (ScrollBehavior | undefined)[] = [];
      panel.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
        const behavior = (options as ScrollIntoViewOptions).behavior;
        behaviors.push(behavior);
        if (behavior !== 'smooth' || browser.smoothScrolls) top = 64;
      };

      fixture.nativeElement.querySelector('a[href="#sheet-pattern-DT"]').click();
      await fixture.whenStable();
      fixture.componentInstance.settled('panel', 'sheet-pattern-DT');
      return behaviors;
    }

    it('glides once on a browser that animates scrolling', async () => {
      expect(await followToDt({ smoothScrolls: true })).toEqual(['smooth']);
    });

    // Measured on rc2 : the smooth scroll was dropped without a word, the panel never came into view.
    it('jumps instead when the browser silently drops the smooth scroll', async () => {
      expect(await followToDt({ smoothScrolls: false })).toEqual(['smooth', 'auto']);
    });

    it('jumps straight away when the reader asks for reduced motion', async () => {
      expect(await followToDt({ smoothScrolls: true, reducedMotion: true })).toEqual(['auto']);
    });
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
  const sibling = file === 'GUS' ? ' Or taken as a [double top](DT.md).' : '';
  return `# ${file}\n\n> The ${file} summary.\n\n${revised}---\n\n${link}${sibling}`;
}

/**
 * Stubs `scrollIntoView` (jsdom has none) and records the id of every element scrolled to. The
 * frames that check the scroll landed never come : that check has specs of its own.
 */
function recordScrolls(): string[] {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  const scrolled: string[] = [];
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolled.push(this.id);
  });
  return scrolled;
}
