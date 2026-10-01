import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { ThemeService } from '../../core/app-state/theme.service';
import { NoteWindow } from './note-window';
import { NotesStore, WATCHLIST } from './notes.store';

/**
 * One note window (#521) : a post-it's text or the watchlist's tickers under a header carrying the
 * four paper colours, « Fermer » — Escape too — and « Détacher » where the browser can. A post-it
 * can be deleted, asked first only when it holds text. Enter adds a ticker, a click on its chip
 * removes it. Docked on a phone, a window does not drag.
 */
describe('NoteWindow', () => {
  let confirmed: boolean;
  let ask: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    confirmed = true;
    ask = vi.fn(() => of(confirmed));
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['documentPictureInPicture'];
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  async function setup(
    kind: 'postit' | 'watchlist',
    docked = false,
  ): Promise<{
    fixture: ComponentFixture<NoteWindow>;
    notes: NotesStore;
    el: HTMLElement;
    key: string;
  }> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        { provide: ThemeService, useValue: { resolved: signal('dark') } },
        { provide: ConfirmService, useValue: { ask } },
      ],
    });
    const notes = TestBed.inject(NotesStore);
    let key = WATCHLIST;
    if (kind === 'postit') key = notes.addPostIt();
    else notes.toggle(WATCHLIST);
    const fixture = TestBed.createComponent(NoteWindow);
    fixture.componentRef.setInput('key', key);
    fixture.componentRef.setInput('docked', docked);
    await fixture.whenStable();
    return { fixture, notes, el: fixture.nativeElement as HTMLElement, key };
  }

  const button = (el: HTMLElement, label: string) =>
    el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;

  it('a post-it keeps what is typed in it', async () => {
    const { fixture, notes, el, key } = await setup('postit');
    const text = el.querySelector('textarea')!;

    text.value = 'Pas de ré-entrée après deux stops';
    text.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(notes.postits().find((p) => p.id === key)?.text).toBe(
      'Pas de ré-entrée après deux stops',
    );
  });

  it('an empty post-it is deleted without asking', async () => {
    const { fixture, notes, el } = await setup('postit');

    button(el, 'notes.delete')!.click();
    await fixture.whenStable();

    expect(ask).not.toHaveBeenCalled();
    expect(notes.postits()).toEqual([]);
  });

  it('a post-it with text asks before it is deleted, and stays when cancelled', async () => {
    const { fixture, notes, el, key } = await setup('postit');
    notes.setText(key, 'SGBX : voir si l’open tient');
    confirmed = false;

    button(el, 'notes.delete')!.click();
    await fixture.whenStable();
    expect(ask).toHaveBeenCalledWith('notes.confirmDelete', { variant: 'danger' });
    expect(notes.postits()).toHaveLength(1);

    confirmed = true;
    button(el, 'notes.delete')!.click();
    await fixture.whenStable();
    expect(notes.postits()).toEqual([]);
  });

  it('the watchlist has no delete — it is the one list of the day', async () => {
    const { el } = await setup('watchlist');

    expect(button(el, 'notes.delete')).toBeNull();
  });

  it('Enter adds the ticker typed, uppercased, and empties the field', async () => {
    const { fixture, notes, el } = await setup('watchlist');
    const field = el.querySelector('input')!;

    field.value = ' mlgo ';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();

    expect(notes.tickers()).toEqual(['MLGO']);
    expect(field.value).toBe('');
    expect(el.querySelector('mat-chip')?.textContent).toContain('MLGO');
  });

  it('a click on a ticker removes it', async () => {
    const { fixture, notes, el } = await setup('watchlist');
    notes.addTicker('ATXG');
    await fixture.whenStable();

    (el.querySelector('mat-chip') as HTMLElement).click();
    await fixture.whenStable();

    expect(notes.tickers()).toEqual([]);
  });

  it('paints the window in the colour picked', async () => {
    const { fixture, notes, el, key } = await setup('postit');

    button(el, 'notes.colors.red')!.click();
    await fixture.whenStable();

    expect(notes.window(key)?.color).toBe('red');
    expect(el.querySelector('.note-window')?.classList).toContain('note-window--red');
  });

  it('closes on Escape, the content kept', async () => {
    const { fixture, notes, el, key } = await setup('postit');
    notes.setText(key, 'gardé');

    el.querySelector('.note-window')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );
    await fixture.whenStable();

    expect(notes.isOpen(key)).toBe(false);
    expect(notes.postits()[0].text).toBe('gardé');
  });

  it('offers no detach where the browser has no Picture-in-Picture window', async () => {
    const { el } = await setup('postit');

    expect(button(el, 'notes.detach')).toBeNull();
  });

  it('moves into its own window, and back when that window closes', async () => {
    const pipDocument = document.implementation.createHTMLDocument('pip');
    let pagehide = () => undefined as void;
    (window as unknown as Record<string, unknown>)['documentPictureInPicture'] = {
      requestWindow: () =>
        Promise.resolve({
          document: pipDocument,
          close: () => undefined,
          addEventListener: (type: string, listener: () => void) => {
            if (type === 'pagehide') pagehide = listener;
          },
        }),
    };
    const { fixture, el } = await setup('watchlist');
    const home = el.parentNode;

    button(el, 'notes.detach')!.click();
    await fixture.whenStable();
    expect(el.parentNode).toBe(pipDocument.body);
    expect(fixture.componentInstance.detached()).toBe(true);

    pagehide();
    await fixture.whenStable();
    expect(el.parentNode).toBe(home);
  });

  // Dropped near the edge of a big screen, a window came back off a laptop's, its header out of reach.
  it('keeps a stored position inside the viewport, and follows a resize', async () => {
    const { fixture, notes, key } = await setup('postit');
    const { innerWidth, innerHeight } = window;

    notes.moveTo(key, 5000, 5000);
    await fixture.whenStable();
    expect(fixture.componentInstance.position()).toEqual({
      x: innerWidth - 280,
      y: innerHeight - 64 - 40,
    });

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
    window.dispatchEvent(new Event('resize'));
    await fixture.whenStable();
    expect(fixture.componentInstance.position().x).toBe(320);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: innerWidth });
  });

  it('docked on a phone, it neither drags nor shows its grip', async () => {
    const { fixture, el } = await setup('postit', true);

    expect(fixture.componentInstance.position()).toEqual({ x: 0, y: 0 });
    expect(el.querySelector('.note-window')?.classList).toContain('note-window--docked');
    expect(el.querySelector('.note-window__grip')).toBeNull();
  });
});
