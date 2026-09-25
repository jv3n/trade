import { Injectable, InjectionToken, Signal, signal } from '@angular/core';
import { CalculatorKey } from '../calculators';

/** A calculator open as a floating widget : where it sits, and how high in the stack. */
export interface OpenWidget {
  key: CalculatorKey;
  x: number;
  y: number;
  z: number;
}

/** Width of a widget — about a card's width on the page, so a card reads the same in both. */
export const WIDGET_WIDTH = 380;
/** Where the first widget lands : under the top bar, against the right edge. */
const FIRST_TOP = 80;
const EDGE = 24;
/** Each further widget lands a little lower and to the left, so none hides another entirely. */
const CASCADE = 28;

/**
 * True inside a widget detached into its own window (#421). Material overlays — tooltips — open in
 * the main document, so a card shown in that window keeps them off.
 */
export const CALCULATOR_DETACHED = new InjectionToken<Signal<boolean>>('CALCULATOR_DETACHED');

/**
 * The calculators open as floating widgets (#421), at the root so they float over every page.
 * Nothing is persisted : a reload opens none, like the values themselves (#388).
 */
@Injectable({ providedIn: 'root' })
export class CalculatorWidgets {
  private readonly _open = signal<OpenWidget[]>([]);
  readonly open = this._open.asReadonly();
  private top = 0;

  isOpen(key: CalculatorKey): boolean {
    return this._open().some((w) => w.key === key);
  }

  /** Opens a calculator — or brings it forward when it is already open, rather than a second one. */
  show(key: CalculatorKey): void {
    if (this.isOpen(key)) {
      this.focus(key);
      return;
    }
    const n = this._open().length;
    // On a phone the widget is narrower than 380 px (`calculator-widget.scss`) : it fills the width.
    const width = Math.min(WIDGET_WIDTH, window.innerWidth - 2 * EDGE);
    const x = Math.max(EDGE, window.innerWidth - width - EDGE - n * CASCADE);
    this._open.update((open) => [...open, { key, x, y: FIRST_TOP + n * CASCADE, z: ++this.top }]);
  }

  focus(key: CalculatorKey): void {
    const z = ++this.top;
    this._open.update((open) => open.map((w) => (w.key === key ? { ...w, z } : w)));
  }

  moveTo(key: CalculatorKey, x: number, y: number): void {
    this._open.update((open) => open.map((w) => (w.key === key ? { ...w, x, y } : w)));
  }

  close(key: CalculatorKey): void {
    this._open.update((open) => open.filter((w) => w.key !== key));
  }
}
