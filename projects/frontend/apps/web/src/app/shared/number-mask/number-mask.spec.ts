import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StbInputModule } from '@portfolioai/ui';
import { describe, expect, it } from 'vitest';
import {
  NumberMaskDirective,
  caretIndexAfterDigits,
  countDigitsBefore,
  formatNumber,
  parseNumber,
  sanitize,
} from './number-mask.directive';

/**
 * Pure-helper tests for the number-mask directive. The host-listener wiring (DOM interaction,
 * caret restoration on a live `<input>`) is tested via the full Material flow in the journal
 * spec — here we pin the parsing / sanitisation / formatting that drives it.
 */
describe('NumberMaskDirective helpers', () => {
  describe('sanitize', () => {
    it('strips non-numeric characters', () => {
      expect(sanitize('abc1.23xyz', 2, false)).toBe('1.23');
    });

    it('normalises comma to dot', () => {
      expect(sanitize('3,21', 2, false)).toBe('3.21');
    });

    it('collapses multiple decimal points to the first', () => {
      expect(sanitize('1.2.3.4', 2, false)).toBe('1.23');
    });

    it('truncates fractional digits past the decimals limit', () => {
      expect(sanitize('3.14159', 2, false)).toBe('3.14');
      expect(sanitize('3.14159', 4, false)).toBe('3.1415');
    });

    it('drops the decimal point entirely when decimals = 0', () => {
      expect(sanitize('1.5', 0, false)).toBe('1');
    });

    it('keeps the leading minus only when allowNegative', () => {
      expect(sanitize('-3.21', 2, true)).toBe('-3.21');
      expect(sanitize('-3.21', 2, false)).toBe('3.21');
    });

    it('strips embedded whitespace', () => {
      expect(sanitize('1 234.56', 2, false)).toBe('1234.56');
    });

    it('blocks the scientific notation `e`', () => {
      expect(sanitize('1e5', 2, false)).toBe('15');
    });
  });

  describe('parseNumber', () => {
    it('returns the number for a valid string', () => {
      expect(parseNumber('3.21')).toBe(3.21);
      expect(parseNumber('-100')).toBe(-100);
    });

    it('returns null for blank / lone `-` / lone `.`', () => {
      expect(parseNumber('')).toBeNull();
      expect(parseNumber('-')).toBeNull();
      expect(parseNumber('.')).toBeNull();
      expect(parseNumber('-.')).toBeNull();
    });

    it('returns null for unparseable strings (defensive)', () => {
      expect(parseNumber('abc')).toBeNull();
    });
  });

  describe('formatNumber', () => {
    it('uses a comma decimal separator and no thousand grouping', () => {
      expect(formatNumber(1234, 2)).toBe('1234');
      expect(formatNumber(1234567.89, 2)).toBe('1234567,89');
      expect(formatNumber(3.21, 4)).toBe('3,21');
    });

    it('respects the decimals cap (max, not min)', () => {
      // 3 has no fractional digits, format must NOT pad with zeros.
      expect(formatNumber(3, 2)).toBe('3');
      // 3.5 displays its actual digits up to the cap, with a comma.
      expect(formatNumber(3.5, 2)).toBe('3,5');
      // Rounds to the cap.
      expect(formatNumber(3.149, 2)).toBe('3,15');
    });

    // #335 : a money field left at `618,2` read like an entry cut short, and a column of prices
    // with ragged decimals is harder to scan than one aligned on the separator.
    it('pads to the decimals when asked — what a field shows once left', () => {
      expect(formatNumber(618.2, 2, ',', true)).toBe('618,20');
      expect(formatNumber(7.2, 4, ',', true)).toBe('7,2000');
      expect(formatNumber(3, 2, ',', true)).toBe('3,00');
    });

    // #311 : one setting drives the language and the formats, so the separator comes from the
    // locale — an English display never mixes `8,5` and `8.6` in the same row.
    // #356 : a field read `1234,56` where the table under it read `1 234,56`.
    it('groups thousands when a group separator is given', () => {
      expect(formatNumber(1234567.89, 2, ',', true, ' ')).toBe('1 234 567,89');
      expect(formatNumber(999, 2, ',', true, ' ')).toBe('999,00');
      expect(formatNumber(-1234.5, 2, ',', true, ' ')).toBe('-1 234,50');
    });

    it('leaves the plain form alone when no group separator is given — what typing sees', () => {
      expect(formatNumber(1234567.89, 2, ',', true)).toBe('1234567,89');
    });

    it('takes the decimal separator it is given', () => {
      expect(formatNumber(1234.56, 2, '.')).toBe('1234.56');
      expect(formatNumber(618.2, 2, '.', true)).toBe('618.20');
    });

    it('handles negative numbers', () => {
      expect(formatNumber(-1234.5, 2)).toBe('-1234,5');
    });
  });

  describe('caret tracking', () => {
    it('countDigitsBefore counts digits + decimal separator up to the index', () => {
      expect(countDigitsBefore('1234,56', 4)).toBe(4); // "1234" → 4 digits
      expect(countDigitsBefore('1234,56', 6)).toBe(6); // "1234,5" → 4 digits + comma + 1 digit
    });

    it('caretIndexAfterDigits places the caret after N positions in the formatted string', () => {
      // After 3 positions in "1234,5" → caret should be at index 3 (after "123").
      expect(caretIndexAfterDigits('1234,5', 3)).toBe(3);
      // After all positions → end of string.
      expect(caretIndexAfterDigits('1234,5', 99)).toBe(6);
    });
  });
});

/**
 * Focus behaviour on a live `<input>`. Protects the pilot-test bug (#306) : a field pre-filled with
 * `15,3` read `15200` after typing `200`, because focusing it left a caret at the end.
 */
describe('NumberMaskDirective on focus', () => {
  @Component({
    imports: [NumberMaskDirective],
    template: `<input appNumberMask [decimals]="1" [number]="15.3" />`,
  })
  class Host {}

  function setup(): HTMLInputElement {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('input');
  }

  // #356 : grouping is stripped on focus so the caret tracking keeps counting digits alone.
  it('drops the thousand separators when the field gets the focus', () => {
    // The specs run on the default `en-US` locale : group `,`, decimal `.`.
    const input = setup();
    input.value = '1,234.5';
    input.focus();
    expect(input.value).toBe('1234.5');
  });

  // The group separator is a comma in English, which the parser reads as a decimal point : left
  // in place it turned `1,234.5` into NaN, and the field came back blank (#356).
  it('reads a grouped value back instead of losing it', () => {
    const input = setup();
    input.value = '1,234.5';
    input.focus();
    input.dispatchEvent(new Event('blur'));

    expect(input.value).toBe('1,234.5');
  });

  it('selects the whole value when the field gets the focus', () => {
    const input = setup();
    input.focus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('keeps the selection through the mouseup of the click that focused the field', () => {
    const input = setup();
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    input.focus();
    const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
    input.dispatchEvent(mouseUp);
    expect(mouseUp.defaultPrevented).toBe(true);
  });

  it('lets a click inside an already focused field place the caret', () => {
    const input = setup();
    input.focus();
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
    input.dispatchEvent(mouseUp);
    expect(mouseUp.defaultPrevented).toBe(false);
  });
});

/**
 * First paint next to `matInput`, which reads `[value]` too and writes the raw number into the
 * field. The locale form must win from the first render, not only once the field is left (#363).
 */
describe('NumberMaskDirective on first render', () => {
  @Component({
    imports: [StbInputModule, NumberMaskDirective],
    template: `<input matInput appNumberMask [decimals]="2" [number]="1500" />`,
  })
  class Host {}

  it('shows a prefilled amount grouped and padded before the field is ever touched', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');

    // Default `en-US` locale in the specs : `1,500.00` is what the French page reads `1 500,00`.
    expect(input.value).toBe('1,500.00');
  });
});

/**
 * Typing faster than change detection, next to `matInput` (#416). Each key updates the host's
 * signal, and the next change detection lands a little later : when `matInput` received the value
 * too, it wrote the raw number back then and erased the key typed in between — the separator
 * after « 4 », so « 4.05 » became « 405 », and a 9 987,60 $ balance a 988 760 $ correction.
 */
describe('NumberMaskDirective typed faster than change detection', () => {
  @Component({
    imports: [StbInputModule, NumberMaskDirective],
    template: `<input
      matInput
      appNumberMask
      [decimals]="2"
      [number]="amount()"
      (numberChange)="amount.set($event)"
    />`,
  })
  class Host {
    readonly amount = signal<number | null>(null);
  }

  /** One key : the element's text as the browser leaves it, then its `input` event. */
  function key(input: HTMLInputElement, text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }

  it('keeps a separator typed before the previous key was rendered', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.focus();

    key(input, '4');
    key(input, '4.'); // before the change detection the first key scheduled
    await fixture.whenStable();
    expect(input.value).toBe('4.');

    key(input, '4.0');
    key(input, '4.05');
    await fixture.whenStable();
    expect(input.value).toBe('4.05');
    expect(fixture.componentInstance.amount()).toBe(4.05);
  });
});
