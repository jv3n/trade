import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesStore, WATCHLIST, localDay } from './notes.store';

/**
 * The notes of the day (#521) — post-its, as many as wanted, and one ticker watchlist, kept in the
 * browser. What the store guarantees :
 * - what is written survives a reload : every post-it's text, the tickers, and per window its
 *   colour, position and open state ;
 * - another day — at the first load, or at the first write of a tab left open past midnight —
 *   empties the open post-its in place, drops the closed ones, and empties the watchlist ;
 * - closing keeps a post-it with text, an empty one goes ; deleting removes it ;
 * - a ticker is uppercased and trimmed, and never listed twice ;
 * - storage holding anything, or blocked, never breaks the page.
 */
describe('NotesStore', () => {
  /** Friday 18 September 2026, 08:30 local — premarket. */
  const FRIDAY = new Date(2026, 8, 18, 8, 30);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FRIDAY);
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /** A fresh page load : a new root injector reads the storage again. */
  function load(): NotesStore {
    TestBed.resetTestingModule();
    return TestBed.inject(NotesStore);
  }

  it('starts with no post-it and the watchlist closed, in blue', () => {
    const notes = load();

    expect(notes.postits()).toEqual([]);
    expect(notes.tickers()).toEqual([]);
    expect(notes.window(WATCHLIST)).toEqual({ open: false, color: 'blue', x: null, y: null });
  });

  it('a new post-it opens, yellow, after the ones already there', () => {
    const notes = load();
    const first = notes.addPostIt();
    const second = notes.addPostIt();

    expect(notes.postits().map((p) => p.id)).toEqual([first, second]);
    expect(notes.window(second)).toEqual({ open: true, color: 'yellow', x: null, y: null });
    expect(notes.front()).toBe(second);
  });

  it('keeps every post-it, the tickers and the windows across a reload', () => {
    const before = load();
    const sgbx = before.addPostIt();
    const rule = before.addPostIt();
    before.setText(sgbx, 'SGBX : voir si l’open tient au-dessus de 1,90');
    before.setText(rule, 'Pas de ré-entrée après deux stops');
    before.setColor(sgbx, 'green');
    before.moveTo(sgbx, 420, 96);
    before.close(rule);
    before.addTicker('mlgo');

    const after = load();

    expect(after.postits().map((p) => p.text)).toEqual([
      'SGBX : voir si l’open tient au-dessus de 1,90',
      'Pas de ré-entrée après deux stops',
    ]);
    expect(after.window(sgbx)).toEqual({ open: true, color: 'green', x: 420, y: 96 });
    expect(after.isOpen(rule)).toBe(false);
    expect(after.tickers()).toEqual(['MLGO']);
  });

  it('a new day empties the open post-its in place, drops the closed ones and empties the list', () => {
    const friday = load();
    const open = friday.addPostIt();
    friday.setText(open, 'Pas de ré-entrée après deux stops');
    friday.setColor(open, 'red');
    friday.moveTo(open, 600, 40);
    const closed = friday.addPostIt();
    friday.setText(closed, 'SGBX : voir l’open');
    friday.close(closed);
    friday.toggle(WATCHLIST);
    friday.addTicker('ATXG');

    vi.setSystemTime(new Date(2026, 8, 21, 7, 45)); // Monday morning
    const monday = load();

    expect(monday.postits()).toEqual([
      { id: open, text: '', open: true, color: 'red', x: 600, y: 40 },
    ]);
    expect(monday.tickers()).toEqual([]);
    expect(monday.isOpen(WATCHLIST)).toBe(true);
  });

  // A trading tab stays open overnight : the first keystroke stamped yesterday's notes with today's
  // date, and the reset never came, reload included.
  it('a tab left open past midnight turns the page at its first write', () => {
    const notes = load();
    const id = notes.addPostIt();
    notes.setText(id, 'note de vendredi');
    notes.addTicker('MLGO');

    vi.setSystemTime(new Date(2026, 8, 21, 7, 45)); // Monday, same tab
    notes.addTicker('VERB');

    expect(notes.postits().map((p) => p.text)).toEqual(['']);
    expect(notes.tickers()).toEqual(['VERB']);
    expect(load().tickers()).toEqual(['VERB']);
  });

  // Premarket starts at 04:00 and the session ends at 20:00 : the local date never cuts a session.
  it('reads the day on the local date — late evening is still the same day', () => {
    const morning = load();
    const id = morning.addPostIt();
    morning.setText(id, 'note du matin');

    vi.setSystemTime(new Date(2026, 8, 18, 23, 30));
    expect(load().postits()[0].text).toBe('note du matin');
    expect(localDay()).toBe('2026-09-18');
  });

  // Every morning's « Nouveau post-it » left empty would otherwise stay a line of the menu.
  it('closing an empty post-it removes it', () => {
    const notes = load();
    const id = notes.addPostIt();

    notes.close(id);

    expect(notes.postits()).toEqual([]);
  });

  it('closing keeps a post-it with its text, deleting removes it', () => {
    const notes = load();
    const kept = notes.addPostIt();
    const gone = notes.addPostIt();
    notes.setText(kept, 'gardé');

    notes.close(kept);
    notes.removePostIt(gone);

    expect(notes.postits().map((p) => [p.id, p.text, p.open])).toEqual([[kept, 'gardé', false]]);
  });

  it('uppercases and trims a ticker, and lists it once', () => {
    const notes = load();

    expect(notes.addTicker('  verb ')).toBe(true);
    expect(notes.addTicker('VERB')).toBe(false);
    expect(notes.addTicker('   ')).toBe(false);
    expect(notes.tickers()).toEqual(['VERB']);
  });

  it('removes a ticker and keeps the others in their order', () => {
    const notes = load();
    ['MLGO', 'ATXG', 'VERB'].forEach((t) => notes.addTicker(t));

    notes.removeTicker('ATXG');

    expect(notes.tickers()).toEqual(['MLGO', 'VERB']);
  });

  it('ignores storage holding anything but notes', () => {
    localStorage.setItem(
      'notes.day',
      JSON.stringify({
        day: localDay(),
        postits: [{ id: 'p-1', text: 42, open: 'yes', color: 'purple' }, { text: 'no id' }],
        tickers: ['MLGO', 7],
        watchlist: { x: 'left' },
      }),
    );

    const notes = load();

    expect(notes.postits()).toEqual([
      { id: 'p-1', text: '', open: false, color: 'yellow', x: null, y: null },
    ]);
    expect(notes.tickers()).toEqual(['MLGO']);
    expect(notes.window(WATCHLIST)).toEqual({ open: false, color: 'blue', x: null, y: null });
  });

  it('starts empty on storage that is not JSON', () => {
    localStorage.setItem('notes.day', '{not json');

    expect(load().postits()).toEqual([]);
  });
});
