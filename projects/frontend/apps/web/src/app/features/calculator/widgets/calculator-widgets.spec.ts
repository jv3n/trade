import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CalculatorWidgets } from './calculator-widgets';

/**
 * The floating calculators' state (#421) : which are open, where, and which is in front. Opening one
 * already open brings it forward rather than a second copy ; each new one lands a little further so
 * none hides another entirely.
 */
describe('CalculatorWidgets', () => {
  let widgets: CalculatorWidgets;

  beforeEach(() => {
    widgets = TestBed.inject(CalculatorWidgets);
  });

  it('opens nothing until asked', () => {
    expect(widgets.open()).toEqual([]);
  });

  it('opens a calculator once, and brings it forward when asked again', () => {
    widgets.show('size');
    widgets.show('pnl');
    widgets.show('size');

    expect(widgets.open().map((w) => w.key)).toEqual(['size', 'pnl']);
    const [size, pnl] = widgets.open();
    expect(size.z).toBeGreaterThan(pnl.z);
  });

  it('lands each new widget a little lower and to the left of the previous one', () => {
    widgets.show('size');
    widgets.show('pnl');
    const [first, second] = widgets.open();

    expect(second.y).toBeGreaterThan(first.y);
    expect(second.x).toBeLessThan(first.x);
  });

  // The page this replaced was the one layout that worked on a phone : a widget must not open off it.
  it('opens inside a phone-sized window', () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    try {
      widgets.show('size');
      expect(widgets.open()[0].x).toBe(24);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    }
  });

  it('remembers where a widget was dropped, and closes one alone', () => {
    widgets.show('size');
    widgets.show('pnl');
    widgets.moveTo('size', 40, 120);
    widgets.close('pnl');

    expect(widgets.open()).toEqual([expect.objectContaining({ key: 'size', x: 40, y: 120 })]);
    expect(widgets.isOpen('pnl')).toBe(false);
  });
});
