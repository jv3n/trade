import { Clipboard } from '@angular/cdk/clipboard';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { CalculatorPage } from './calculator-page';

/**
 * The calculator page (#388) : five cards whose results follow the typing, « — » until a card has
 * what it needs, an amber line when a short's stop sits on the wrong side, a copy button per
 * result, and values that survive leaving the page — but nothing that reaches a backend.
 */
function setup(): {
  fixture: ComponentFixture<CalculatorPage>;
  page: CalculatorPage;
  copy: ReturnType<typeof vi.fn>;
} {
  const copy = vi.fn(() => true);
  TestBed.configureTestingModule({
    imports: [CalculatorPage],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      { provide: Clipboard, useValue: { copy } },
    ],
  });
  return render(copy);
}

function render(copy: ReturnType<typeof vi.fn>) {
  const fixture = TestBed.createComponent(CalculatorPage);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, copy };
}

function results(fixture: ComponentFixture<CalculatorPage>): string[] {
  return [...fixture.nativeElement.querySelectorAll('.result__value')].map((o: HTMLElement) =>
    o.textContent!.trim(),
  );
}

describe('CalculatorPage', () => {
  it('reads « — » everywhere until something is typed', () => {
    const { fixture } = setup();

    expect(results(fixture).every((r) => r === '—')).toBe(true);
  });

  it('computes a card as soon as it has its inputs', () => {
    const { fixture, page } = setup();

    page.set('moveFrom', 3.23);
    page.set('moveTo', 2.7);
    fixture.detectChanges();

    expect(results(fixture)[0]).toBe('-16.4 %');
  });

  it('sizes a short rounded down, with the risk that count really takes', () => {
    const { fixture, page } = setup();

    page.set('sizeRisk', 100);
    page.set('sizeEntry', 3.23);
    page.set('sizeStop', 3.45);
    fixture.detectChanges();

    expect(page.size()).toEqual({ shares: 454, risk: expect.closeTo(99.88, 2) });
    expect(fixture.nativeElement.querySelector('.calc-error')).toBeNull();
  });

  it('says so when a short has its stop under the entry, instead of a share count', () => {
    const { fixture, page } = setup();

    page.set('sizeRisk', 100);
    page.set('sizeEntry', 3.23);
    page.set('sizeStop', 3.0);
    fixture.detectChanges();

    expect(page.size()).toBeNull();
    expect(fixture.nativeElement.querySelector('.calc-error').textContent).toContain(
      'calculator.size.wrongSide',
    );
  });

  it('says the stop is too far for the risk instead of reading zero shares', () => {
    const { fixture, page } = setup();

    page.set('sizeRisk', 0.5);
    page.set('sizeEntry', 3.2);
    page.set('sizeStop', 4.0);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.calc-error').textContent).toContain(
      'calculator.size.tooFar',
    );
  });

  it('gives the distance to the stop before a target is typed', () => {
    const { page } = setup();

    page.set('rrPrice', 3.1);
    page.set('rrStop', 3.45);

    expect(page.toStop()?.dollars).toBeCloseTo(0.35, 4);
    expect(page.ratio()).toBeNull();
  });

  it('colours the P&L of a short like an outcome', () => {
    const { fixture, page } = setup();

    page.set('pnlEntry', 3.23);
    page.set('pnlCover', 3.45);
    page.set('pnlShares', 454);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.result__value.profit-negative')).toHaveLength(
      2,
    );
  });

  it('copies a result as a bare number, and marks the button for a moment', () => {
    const { fixture, page, copy } = setup();
    page.set('moveFrom', 3.23);
    page.set('moveTo', 2.7);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.result button') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(copy).toHaveBeenCalledWith('-16.4');
    expect(button.textContent).toContain('check');
  });

  // The share count is typed into the broker next : a grouped `4,545` would paste as text.
  it('copies a share count without its grouping, ready for the broker', () => {
    const { page, copy } = setup();
    page.set('sizeRisk', 1000);
    page.set('sizeEntry', 3.23);
    page.set('sizeStop', 3.45);

    page.copy('shares', page.size()!.shares, 0);

    expect(copy).toHaveBeenCalledWith('4545');
  });

  it('leaves the copy button off while a result reads « — »', () => {
    const { fixture } = setup();

    const button = fixture.nativeElement.querySelector('.result button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  // The page is a scratchpad, but a trip to the lexicon and back must not wipe it.
  it('keeps what was typed when the page is left and opened again', () => {
    const { fixture, page, copy } = setup();
    page.set('moveFrom', 3.23);
    page.set('moveTo', 2.7);
    fixture.destroy();

    const again = render(copy);

    expect(again.page.move()).toBeCloseTo(-16.41, 2);
  });
});
