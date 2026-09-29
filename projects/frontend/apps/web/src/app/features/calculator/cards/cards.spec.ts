import { Clipboard } from '@angular/cdk/clipboard';
import { NgComponentOutlet } from '@angular/common';
import { Component, Type, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSummary } from '../../../core/api/account/account.model';
import { AccountRepository } from '../../../core/api/account/account.repository';
import { PatternsRepository } from '../../../core/api/patterns/patterns.repository';
import { LanguageService } from '../../../core/app-state/language.service';
import { CalculatorField, CalculatorStore } from '../calculator.store';
import { CALCULATORS } from '../calculators';
import { MaxCard } from './max-card';
import { RrCard } from './rr-card';
import { SizeCard } from './size-card';

/** The four cards side by side, the way the widgets lay them out one at a time. */
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
 * The calculator cards (#388, #421, #496) : results that follow the typing, « — » until a card has
 * what it needs, an amber line when a short's stop sits on the wrong side, a copy button per result,
 * and values that survive the card going away. The account balance is read to prefill the two
 * sizing cards, and the settings — stop preset, ceiling, broker rules — are kept in the browser.
 *
 * Each card reads [CalculatorStore], the way its floating widget does : the figures are typed into
 * the store, as a card's field would.
 */
function setup(summary = of({ balance: 4820 } as AccountSummary)): {
  fixture: ComponentFixture<CardsHost>;
  type: (field: CalculatorField, value: number | null) => void;
  copy: ReturnType<typeof vi.fn>;
  getSummary: ReturnType<typeof vi.fn>;
} {
  const copy = vi.fn(() => true);
  const getSummary = vi.fn(() => summary);
  TestBed.configureTestingModule({
    imports: [CardsHost],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      { provide: Clipboard, useValue: { copy } },
      provideRouter([]),
      { provide: AccountRepository, useValue: { getSummary } },
      { provide: LanguageService, useValue: { lang: () => 'en' } },
      {
        provide: PatternsRepository,
        useValue: { markdown: () => of('# Margin\n\n*Last revised : 2026-09-29.*\n') },
      },
    ],
  });
  return { ...render(copy), getSummary };
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
  // The settings outlive a reload : without this, one test's broker rules leak into the next.
  beforeEach(() => localStorage.clear());

  it('lists the four calculators, in order', () => {
    const { fixture } = setup();
    const keys = [...fixture.nativeElement.querySelectorAll('[data-calculator]')].map(
      (e: HTMLElement) => e.dataset['calculator'],
    );

    expect(keys).toEqual(['move', 'max', 'size', 'rr']);
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

  it('prefills the balance from the account, once for both sizing cards', () => {
    const { getSummary } = setup();

    expect(TestBed.inject(CalculatorStore).values().balance).toBe(4820);
    expect(getSummary).toHaveBeenCalledTimes(1);
  });

  it('leaves the balance to type when the account cannot be read', () => {
    setup(throwError(() => new Error('offline')));

    expect(TestBed.inject(CalculatorStore).values().balance).toBeNull();
  });

  it('turns the risk in % of the balance into dollars, spelled out', () => {
    const { fixture, type } = setup();

    type('sizeRisk', 5);

    expect(card(fixture, SizeCard).risk()).toBeCloseTo(241, 2);
  });

  it('lays out the ladder of entry levels, the one nearest the current price highlighted', () => {
    const { fixture, type } = setup();

    type('sizeRisk', 5);
    type('sizeOpen', 3.35);
    type('sizeCurrent', 4.02);

    const rows = [...fixture.nativeElement.querySelectorAll('.calc-ladder tbody tr')];
    expect(rows).toHaveLength(7);
    expect(fixture.nativeElement.querySelector('.calc-ladder__current').textContent).toContain(
      '+20 %',
    );
  });

  // The +40 % preset is the tracker's default : an open and a risk are enough for a ladder.
  it('starts from the first stop preset, and switches to the other in one click', () => {
    const { fixture, type } = setup();
    type('sizeRisk', 5);
    type('sizeOpen', 3.35);

    const toggles = fixture.nativeElement.querySelectorAll('mat-button-toggle button');
    (toggles[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(TestBed.inject(CalculatorStore).values().sizeStop).toBe(31);
    expect(
      card(fixture, SizeCard)
        .ladder()!
        .map((r) => r.level),
    ).toEqual([5, 7, 10, 15, 20, 25, 30]);
  });

  // At +30 % against a +31 % stop, 241 $ of risk buys 7 194 shares : 31 000 $ of margin.
  it('flags in amber the rows whose margin the buying power cannot cover', () => {
    const { fixture, type } = setup();

    type('sizeRisk', 5);
    type('sizeOpen', 3.35);
    type('sizeStop', 31);

    const refused = fixture.nativeElement.querySelectorAll('.calc-ladder__refused');
    expect(refused.length).toBeGreaterThan(0);
    expect(refused[refused.length - 1].textContent).toContain('+30 %');
    expect(fixture.nativeElement.querySelector('.calc-error').textContent).toContain(
      'calculator.size.refused',
    );
  });

  it('holds the margin floor per share in the ladder under it', () => {
    const { fixture, type } = setup();

    type('sizeRisk', 5);
    type('sizeOpen', 0.5);

    const first = card(fixture, SizeCard).ladder()![0];
    expect(first.margin).toBeCloseTo(first.shares * 2.5, 2);
  });

  it('says so when the stop sits under the first entry level, instead of a ladder', () => {
    const { fixture, type } = setup();

    type('sizeRisk', 5);
    type('sizeOpen', 3.35);
    type('sizeStop', 4);

    expect(fixture.nativeElement.querySelector('.calc-ladder')).toBeNull();
    expect(fixture.nativeElement.querySelector('.calc-error').textContent).toContain(
      'calculator.size.noLevel',
    );
  });

  it('gives the max size the margin allows on the prefilled balance, and names the cap', () => {
    const { fixture, type } = setup();

    type('maxPrice', 0.65);
    type('maxLocate', 0.012);

    expect(card(fixture, MaxCard).size()).toEqual(
      expect.objectContaining({ shares: 3600, bound: 'margin', locateCost: expect.closeTo(43.2) }),
    );
    expect(
      fixture.nativeElement.querySelector('[data-calculator="max"] .calc-reading').textContent,
    ).toContain('calculator.max.boundByMargin');
  });

  it('lets the ceiling bind the max size when it is the lower cap', () => {
    const { fixture, type } = setup();

    type('maxPrice', 3.35);
    type('maxCeiling', 40);

    expect(card(fixture, MaxCard).size()).toEqual(
      expect.objectContaining({ shares: 500, bound: 'ceiling' }),
    );
  });

  it('shares one set of broker rules between the two sizing cards', () => {
    const { fixture, type } = setup();
    type('maxPrice', 0.65);
    type('sizeRisk', 5);
    type('sizeOpen', 3.35);

    type('leverage', 4);

    expect(card(fixture, MaxCard).size()?.shares).toBe(7300);
    expect(card(fixture, SizeCard).usable()).toBeCloseTo(18316, 0);
  });

  // The settings are choices, not figures of a trade : retyping them every morning is the error.
  it('remembers the settings across a reload, and forgets the figures', () => {
    const { type } = setup();
    type('leverage', 3);
    type('sizeStop', 31);
    type('maxCeiling', 80);
    type('maxPrice', 0.65);
    TestBed.resetTestingModule();

    setup();
    const values = TestBed.inject(CalculatorStore).values();

    expect(values).toEqual(
      expect.objectContaining({ leverage: 3, sizeStop: 31, maxCeiling: 80, maxPrice: null }),
    );
  });

  it('links the broker rules to their note, dated from the note itself', () => {
    const { fixture } = setup();

    const link = fixture.nativeElement.querySelector(
      '[data-calculator="max"] app-calc-broker a',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/patterns#sheet-notes-tradezero-margin');
    expect(link.parentElement!.textContent).toContain('calculator.broker.checkedOn');
  });

  it('gives the distance to the stop before a target is typed', () => {
    const { fixture, type } = setup();

    type('rrPrice', 3.1);
    type('rrStop', 3.45);

    expect(card(fixture, RrCard).toStop()?.dollars).toBeCloseTo(0.35, 4);
    expect(card(fixture, RrCard).ratio()).toBeNull();
  });

  it('names the R:R in full, and reads it in one line', () => {
    const { fixture, type } = setup();

    type('rrPrice', 3.1);
    type('rrStop', 3.45);
    type('rrTarget', 2.5);

    expect(
      fixture.nativeElement.querySelector('[data-calculator="rr"] .calc-reading').textContent,
    ).toContain('calculator.rr.reading');
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

  // The share count is typed into the broker next : a grouped `3,600` would paste as text (#406).
  it('copies a share count without its grouping, ready for the broker', () => {
    const { fixture, type, copy } = setup();
    type('maxPrice', 0.65);

    const shares = fixture.nativeElement.querySelector(
      '[data-calculator="max"] .result button',
    ) as HTMLButtonElement;
    shares.click();

    expect(copy).toHaveBeenCalledWith('3600');
  });

  it('copies the share count of a ladder row', () => {
    const { fixture, type, copy } = setup();
    type('sizeRisk', 5);
    type('sizeOpen', 3.35);

    const first = fixture.nativeElement.querySelector(
      '.calc-ladder tbody tr button',
    ) as HTMLButtonElement;
    first.click();

    expect(copy).toHaveBeenCalledWith('205');
  });

  it('leaves the copy button off while a result reads « — »', () => {
    const { fixture } = setup();

    const button = fixture.nativeElement.querySelector('.result button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  // #408 : the unit moved into the field, so a label fits a widget without an ellipsis.
  it('shows the unit of a field inside it, next to a short label', () => {
    const { fixture } = setup();
    const balance = fixture.nativeElement.querySelector('[data-calculator="size"] app-calc-field');

    expect(balance.querySelector('mat-label').textContent.trim()).toBe('calculator.fields.balance');
    expect(balance.querySelector('.calc-unit').textContent.trim()).toBe('account.usdUnit');
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
