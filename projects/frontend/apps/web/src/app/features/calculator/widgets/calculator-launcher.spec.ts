import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { CalculatorLauncher } from './calculator-launcher';
import { CalculatorWidgets } from './calculator-widgets';

/**
 * The top bar's launcher (#421) : a menu of the five calculators, each opening its floating widget,
 * the one already open marked so.
 */
describe('CalculatorLauncher', () => {
  async function open() {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideTranslateService({ lang: 'en' })],
    });
    const fixture = TestBed.createComponent(CalculatorLauncher);
    await fixture.whenStable();
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    return { fixture, items: () => [...document.querySelectorAll('[mat-menu-item]')] };
  }

  it('lists the five calculators', async () => {
    const { items } = await open();

    expect(items().map((i) => i.textContent)).toEqual([
      expect.stringContaining('calculator.move.title'),
      expect.stringContaining('calculator.size.title'),
      expect.stringContaining('calculator.pnl.title'),
      expect.stringContaining('calculator.rr.title'),
      expect.stringContaining('calculator.avg.title'),
    ]);
  });

  it('opens the calculator picked, and marks it open', async () => {
    const { fixture, items } = await open();

    (items()[1] as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(TestBed.inject(CalculatorWidgets).isOpen('size')).toBe(true);
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    expect(items()[1].textContent).toContain('calculator.launcher.isOpen');
  });
});
