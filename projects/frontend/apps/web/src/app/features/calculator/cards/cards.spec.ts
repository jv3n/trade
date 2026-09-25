import { Clipboard } from '@angular/cdk/clipboard';
import { NgComponentOutlet } from '@angular/common';
import { Component, Type, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { CalculatorField, CalculatorStore } from '../calculator.store';
import { CALCULATORS } from '../calculators';
import { RrCard } from './rr-card';
import { SizeCard } from './size-card';

/** The five cards side by side, the way the widgets lay them out one at a time. */
@Component({
  imports: [NgComponentOutlet],
  template: `
    @for (c of calculators; track c.key) {
      <section [attr.data-calculator]="c.key">
        <ng-container *ngComponentOutlet="c.card" />
      </section>
    }
  `,
})
class CardsHost {
  readonly calculators = CALCULATORS;
}

/**
 * The calculator cards (#388, #421) : results that follow the typing, « — » until a card has what
 * it needs, an amber line when a short's stop sits on the wrong side, a copy button per result, and
 * values that survive the card going away — but nothing that reaches a backend.
 *
 * Each card reads [CalculatorStore], the way its floating widget does : the figures are typed into
 * the store, as a card's field would.
 */
function setup(): {
  fixture: ComponentFixture<CardsHost>;
  type: (field: CalculatorField, value: number | null) => void;
  copy: ReturnType<typeof vi.fn>;
} {
  const copy = vi.fn(() => true);
  TestBed.configureTestingModule({
    imports: [CardsHost],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      { provide: Clipboard, useValue: { copy } },
    ],
  });
  return render(copy);
}

function render(copy: ReturnType<typeof vi.fn>) {
  const fixture = TestBed.createComponent(CardsHost);
  fixture.detectChanges();
  const store = TestBed.inject(CalculatorStore);
  const type = (field: CalculatorField, value: number | null) => {
    store.set(field, value);
    fixture.detectChanges();
  };
  return { fixture, type, copy };
}

function card<T>(fixture: ComponentFixture<CardsHost>, component: Type<T>): T {
  return fixture.debugElement.query(By.directive(component)).componentInstance as T;
}

function results(fixture: ComponentFixture<CardsHost>): string[] {
  return [...fixture.nativeElement.querySelectorAll('.result__value')].map((o: HTMLElement) =>
    o.textContent!.trim(),
  );
}

describe('Calculator cards', () => {
  it('lists the five calculators, in order', () => {
    const { fixture } = setup();
    const keys = [...fixture.nativeElement.querySelectorAll('[data-calculator]')].map(
      (e: HTMLElement) => e.dataset['calculator'],
    );

    expect(keys).toEqual(['move', 'size', 'pnl', 'rr', 'avg']);
  });

  it('reads « — » everywhere until something is typed', () => {
    const { fixture } = setup();

    expect(results(fixture).every((r) => r === '—')).toBe(true);
  });

  it('computes a card as soon as it has its inputs', () => {
    const { fixture, type } = setup();

    type('moveFrom', 3.23);
    type('moveTo', 2.7);

    expect(results(fixture)[0]).toBe('-16.4 %');
  });

  it('sizes a short rounded down, with the risk that count really takes', () => {
    const { fixture, type } = setup();

    type('sizeRisk', 100);
    type('sizeEntry', 3.23);
    type('sizeStop', 3.45);

    expect(card(fixture, SizeCard).size()).toEqual({ shares: 454, risk: expect.closeTo(99.88, 2) });
    expect(fixture.nativeElement.querySelector('.calc-error')).toBeNull();
  });

  it('says so when a short has its stop under the entry, instead of a share count', () => {
    const { fixture, type } = setup();

    type('sizeRisk', 100);
    type('sizeEntry', 3.23);
    type('sizeStop', 3.0);

    expect(card(fixture, SizeCard).size()).toBeNull();
    expect(fixture.nativeElement.querySelector('.calc-error').textContent).toContain(
      'calculator.size.wrongSide',
    );
  });

  it('says the stop is too far for the risk instead of reading zero shares', () => {
    const { fixture, type } = setup();

    type('sizeRisk', 0.5);
    type('sizeEntry', 3.2);
    type('sizeStop', 4.0);

    expect(fixture.nativeElement.querySelector('.calc-error').textContent).toContain(
      'calculator.size.tooFar',
    );
  });

  it('gives the distance to the stop before a target is typed', () => {
    const { fixture, type } = setup();

    type('rrPrice', 3.1);
    type('rrStop', 3.45);

    expect(card(fixture, RrCard).toStop()?.dollars).toBeCloseTo(0.35, 4);
    expect(card(fixture, RrCard).ratio()).toBeNull();
  });

  it('colours the P&L of a short like an outcome', () => {
    const { fixture, type } = setup();

    type('pnlEntry', 3.23);
    type('pnlCover', 3.45);
    type('pnlShares', 454);

    expect(fixture.nativeElement.querySelectorAll('.result__value.profit-negative')).toHaveLength(
      2,
    );
  });

  it('copies a result as a bare number, and marks the button for a moment', () => {
    const { fixture, type, copy } = setup();
    type('moveFrom', 3.23);
    type('moveTo', 2.7);

    const button = fixture.nativeElement.querySelector('.result button') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(copy).toHaveBeenCalledWith('-16.4');
    expect(button.textContent).toContain('check');
  });

  // The share count is typed into the broker next : a grouped `4,545` would paste as text (#406).
  it('copies a share count without its grouping, ready for the broker', () => {
    const { fixture, type, copy } = setup();
    type('sizeRisk', 1000);
    type('sizeEntry', 3.23);
    type('sizeStop', 3.45);

    const shares = fixture.nativeElement.querySelector(
      '[data-calculator="size"] .result button',
    ) as HTMLButtonElement;
    shares.click();

    expect(copy).toHaveBeenCalledWith('4545');
  });

  it('leaves the copy button off while a result reads « — »', () => {
    const { fixture } = setup();

    const button = fixture.nativeElement.querySelector('.result button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  // #408 : the unit moved into the field, so a label fits a widget without an ellipsis.
  it('shows the unit of a field inside it, next to a short label', () => {
    const { fixture } = setup();
    const risk = fixture.nativeElement.querySelector('[data-calculator="size"] app-calc-field');

    expect(risk.querySelector('mat-label').textContent.trim()).toBe('calculator.fields.risk');
    expect(risk.querySelector('.calc-unit').textContent.trim()).toBe('account.usdUnit');
  });

  // A scratchpad, but closing a widget and opening it again must not wipe it.
  it('keeps what was typed when a card goes away and comes back', () => {
    const { fixture, type, copy } = setup();
    type('moveFrom', 3.23);
    type('moveTo', 2.7);
    fixture.destroy();

    const again = render(copy);

    expect(results(again.fixture)[0]).toBe('-16.4 %');
  });
});
