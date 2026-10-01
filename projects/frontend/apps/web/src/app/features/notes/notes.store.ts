import { Injectable, computed, signal } from '@angular/core';
import { format } from 'date-fns';

/** The watchlist's key ; every other window is a post-it, keyed by its id. */
export const WATCHLIST = 'watchlist';

/** The paper of a window, like a real post-it — not a status, not a filter. */
export type NoteColor = 'green' | 'blue' | 'yellow' | 'red';
export const NOTE_COLORS: readonly NoteColor[] = ['green', 'blue', 'yellow', 'red'];

/** How a window was left : open or not, its colour, where it was dropped (null = never moved). */
export interface NoteWindowState {
  open: boolean;
  color: NoteColor;
  x: number | null;
  y: number | null;
}

/** One post-it : its text and its window. */
export interface PostIt extends NoteWindowState {
  id: string;
  text: string;
  /** Written in at least once — what keeps its place from one day to the next, empty or not. */
  written: boolean;
}

export interface NotesState {
  /** The local day the notes were written on, `yyyy-MM-dd`. */
  day: string;
  postits: PostIt[];
  tickers: string[];
  watchlist: NoteWindowState;
}

const STORAGE_KEY = 'notes.day';

/** The local date : premarket starts at 04:00 and the session ends at 20:00, so midnight cuts nothing. */
export function localDay(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

/**
 * The notes of the day (#521) — post-its, as many as wanted, and one ticker watchlist : scraps of
 * paper for the session. Kept in the browser, like the calculators' settings : no endpoint, they
 * die tonight. On another day — at the first load, or at the first write of a tab left open past
 * midnight — an open post-it that held text comes back empty in place, every other one goes, and
 * the watchlist is emptied ; every window kept keeps its colour, its position and whether it was
 * open.
 *
 * Known limit, accepted : the notes live in one browser.
 */
@Injectable({ providedIn: 'root' })
export class NotesStore {
  private readonly _state = signal<NotesState>(readState(localDay()));
  readonly state = this._state.asReadonly();
  readonly postits = computed(() => this._state().postits);
  readonly tickers = computed(() => this._state().tickers);
  /** The window clicked last sits on top of the others ; not worth keeping across a reload. */
  readonly front = signal<string>(WATCHLIST);

  /** A window's state alone — a post-it's id and text are not part of it. */
  window(key: string): NoteWindowState | undefined {
    const state = this._state();
    const w = key === WATCHLIST ? state.watchlist : state.postits.find((p) => p.id === key);
    return w && { open: w.open, color: w.color, x: w.x, y: w.y };
  }

  isOpen(key: string): boolean {
    return this.window(key)?.open ?? false;
  }

  /** A new post-it, open and on top of the others ; returns its key. */
  addPostIt(): string {
    const id = newId();
    this.write((s) => ({
      ...s,
      postits: [
        ...s.postits,
        { id, text: '', written: false, open: true, color: 'yellow', x: null, y: null },
      ],
    }));
    this.front.set(id);
    return id;
  }

  /** Gone for good — unlike « close », which keeps it in the menu with its text. */
  removePostIt(id: string): void {
    this.write((s) => ({ ...s, postits: s.postits.filter((p) => p.id !== id) }));
  }

  toggle(key: string): void {
    const open = !this.isOpen(key);
    this.patchWindow(key, { open });
    if (open) this.front.set(key);
  }

  /**
   * Closed, a post-it stays in the menu with its text — one never written in carries nothing, so it
   * goes : otherwise every « Nouveau post-it » of every morning would stay a line of the menu.
   */
  close(key: string): void {
    const postit = this._state().postits.find((p) => p.id === key);
    if (postit && !postit.written && !postit.text.trim()) {
      this.removePostIt(key);
      return;
    }
    this.patchWindow(key, { open: false });
  }

  setColor(key: string, color: NoteColor): void {
    this.patchWindow(key, { color });
  }

  /** A dropped window is a position write — nothing to confirm. */
  moveTo(key: string, x: number, y: number): void {
    this.patchWindow(key, { x, y });
  }

  setText(id: string, text: string): void {
    this.write((s) => ({
      ...s,
      postits: s.postits.map((p) =>
        p.id === id ? { ...p, text, written: p.written || !!text.trim() } : p,
      ),
    }));
  }

  /** Uppercased and trimmed like every ticker of the app ; empty or already listed, nothing is added. */
  addTicker(raw: string): boolean {
    const ticker = raw.trim().toUpperCase();
    if (!ticker || this.tickers().includes(ticker)) return false;
    this.write((s) => ({ ...s, tickers: [...s.tickers, ticker] }));
    return true;
  }

  removeTicker(ticker: string): void {
    this.write((s) => ({ ...s, tickers: s.tickers.filter((t) => t !== ticker) }));
  }

  private patchWindow(key: string, patch: Partial<NoteWindowState>): void {
    this.write((s) =>
      key === WATCHLIST
        ? { ...s, watchlist: { ...s.watchlist, ...patch } }
        : { ...s, postits: s.postits.map((p) => (p.id === key ? { ...p, ...patch } : p)) },
    );
  }

  private write(change: (state: NotesState) => NotesState): void {
    // A tab left open past midnight turns the page first : stamping yesterday's notes with today's
    // date would keep them for good.
    const today = localDay();
    this._state.update((s) => change(s.day === today ? s : turnThePage(s, today)));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state()));
    } catch {
      // Blocked storage : the notes last the page, which is most of their worth anyway.
    }
  }
}

/**
 * Another day : an open post-it ever written in comes back empty in place — a red one kept bottom
 * right for the day's rules stays there through a quiet morning — and every other one goes, so
 * post-its never written in do not pile up from day to day.
 */
function turnThePage(state: NotesState, today: string): NotesState {
  return {
    day: today,
    postits: state.postits
      .filter((p) => p.open && (p.written || p.text.trim()))
      .map((p) => ({ ...p, text: '', written: true })),
    tickers: [],
    watchlist: state.watchlist,
  };
}

function newId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Storage can be blocked or hold anything : only well-formed values are taken. Another day keeps
 * the windows as they were left and drops what was written on them.
 */
function readState(today: string): NotesState {
  let stored: Partial<NotesState>;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<NotesState>;
  } catch {
    stored = {};
  }
  const read: NotesState = {
    day: typeof stored.day === 'string' ? stored.day : today,
    postits: (Array.isArray(stored.postits) ? stored.postits : [])
      .filter((p): p is PostIt => typeof p?.id === 'string')
      .map((p) => {
        const text = typeof p.text === 'string' ? p.text : '';
        return {
          id: p.id,
          text,
          written: typeof p.written === 'boolean' ? p.written : !!text.trim(),
          ...readWindow(p, 'yellow'),
        };
      }),
    tickers: Array.isArray(stored.tickers)
      ? stored.tickers.filter((t): t is string => typeof t === 'string')
      : [],
    watchlist: readWindow(stored.watchlist, 'blue'),
  };
  return read.day === today ? read : turnThePage(read, today);
}

/** A window as stored, each field checked ; a missing or wrong one falls back to closed, [color]. */
function readWindow(stored: unknown, color: NoteColor): NoteWindowState {
  const w = (stored ?? {}) as Partial<NoteWindowState>;
  return {
    open: typeof w.open === 'boolean' ? w.open : false,
    color: NOTE_COLORS.includes(w.color as NoteColor) ? (w.color as NoteColor) : color,
    x: typeof w.x === 'number' ? w.x : null,
    y: typeof w.y === 'number' ? w.y : null,
  };
}
