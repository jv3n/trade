import {
  Directive,
  ElementRef,
  HostListener,
  effect,
  inject,
  input,
  numberAttribute,
  output,
} from '@angular/core';

/**
 * Lightweight numeric input mask for plain `<input type="text">`. Drop the `type="number"`
 * (clunky spinners, locale-fragile decimal point, Signal Forms NG8022 friction with `step`)
 * and use this instead.
 *
 * Behaviour at the keystroke :
 *   - Only `0-9`, `.`, `,` are allowed. A typed comma is normalised to a point.
 *   - At most one decimal separator. Extra dots are dropped.
 *   - Decimals beyond `[decimals]` are truncated (default 2).
 *   - Optional `[allowNegative]` lets a leading `-` through.
 *
 * Formatting :
 *   - **Thousand separators** are inserted live (`1234` → `1,234`) on the integer part. The
 *     cursor is preserved across the reformat — caret positions are tracked by digit index,
 *     so inserting / removing a separator doesn't bounce the user back to the start.
 *
 * Wiring :
 *   - `[appNumberMask]` doesn't pretend to be a `ControlValueAccessor` — Signal Forms native
 *     binding on `type="text"` would round-trip the string, not the parsed number. Use the
 *     `(numberChange)` output to push the parsed number back into the form model imperatively
 *     (signal `model.update(...)`).
 *   - `[value]` reads the current numeric value from the consumer (model signal). The
 *     directive formats it for display and writes the formatted string back to the element on
 *     change.
 *
 * Example :
 *
 * ```html
 * <input
 *   appNumberMask
 *   [decimals]="4"
 *   [value]="model().openPrice"
 *   (numberChange)="setOpenPrice($event)"
 * />
 * ```
 */
@Directive({
  selector: 'input[appNumberMask]',
})
export class NumberMaskDirective {
  private readonly host = inject<ElementRef<HTMLInputElement>>(ElementRef);

  /** Number of decimal places allowed (default 2). Set to 0 for integers only. */
  readonly decimals = input(2, { transform: numberAttribute });
  /** Min value clamped on blur. Null = no min. */
  readonly min = input<number | null>(null);
  /** Max value clamped on blur. Null = no max. */
  readonly max = input<number | null>(null);
  /** Whether to allow a leading minus sign. Default false. */
  readonly allowNegative = input(false);
  /** Current numeric value — used to seed / re-sync the input's text. */
  readonly value = input<number | null>(null);

  /** Emits the parsed number whenever the user's input resolves to one. `null` = blank. */
  readonly numberChange = output<number | null>();

  constructor() {
    // Sync the visible text with the bound `[value]`. Programmatic updates from the model
    // (reset form, edit-mode prefill) flow through here. We skip the round-trip when the
    // current text already parses to the same value to avoid clobbering the user's caret
    // mid-typing.
    effect(() => {
      const v = this.value();
      const current = parseNumber(this.host.nativeElement.value);
      if (current !== v) {
        this.host.nativeElement.value = v === null ? '' : formatNumber(v, this.decimals());
      }
    });
  }

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const el = this.host.nativeElement;
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    const decimals = this.decimals();
    const allowNeg = this.allowNegative();

    // Track digit-index of the caret in the pre-clean string so we can restore it after the
    // reformat (separators / negative sign added or removed).
    const caretDigits = countDigitsBefore(raw, caret);

    const cleaned = sanitize(raw, decimals, allowNeg);
    const num = parseNumber(cleaned);

    const formatted = num === null ? cleaned : formatNumber(num, decimals);
    el.value = formatted;

    // Restore caret — find the position in `formatted` that comes after `caretDigits` digits
    // (and the optional leading minus sign).
    const newCaret = caretIndexAfterDigits(formatted, caretDigits);
    el.setSelectionRange(newCaret, newCaret);

    this.numberChange.emit(num);

    // Stop the native `input` event from propagating — Signal Forms' built-in
    // `[formField]` (if it were attached) would otherwise try to bind the now-formatted
    // string back to the model as a string. We push the number explicitly via the output.
    event.stopPropagation();
  }

  @HostListener('blur')
  onBlur(): void {
    const el = this.host.nativeElement;
    let num = parseNumber(el.value);
    const min = this.min();
    const max = this.max();
    if (num !== null && min !== null && num < min) num = min;
    if (num !== null && max !== null && num > max) num = max;
    el.value = num === null ? '' : formatNumber(num, this.decimals());
    this.numberChange.emit(num);
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests.
// ---------------------------------------------------------------------------

/**
 * Strips everything except digits + (one) decimal point. Replaces `,` with `.`. Truncates
 * fractional digits past `decimals`. Preserves leading `-` only when `allowNegative`.
 */
export function sanitize(raw: string, decimals: number, allowNegative: boolean): string {
  // Normalise the decimal separator + strip whitespace.
  let s = raw.replace(/,/g, '.').replace(/\s+/g, '');
  const isNegative = allowNegative && s.startsWith('-');
  s = s.replace(/-/g, '');
  // Keep only digits and `.`.
  s = s.replace(/[^0-9.]/g, '');
  // Collapse multiple decimal points to the first one.
  const dotAt = s.indexOf('.');
  if (dotAt !== -1) {
    s = s.slice(0, dotAt + 1) + s.slice(dotAt + 1).replace(/\./g, '');
    if (decimals === 0) {
      s = s.slice(0, dotAt);
    } else {
      s = s.slice(0, dotAt + 1 + decimals);
    }
  }
  return isNegative ? '-' + s : s;
}

/** Parses a cleaned string to a number. Returns `null` for blank / lone `-` / lone `.`. */
export function parseNumber(s: string): number | null {
  if (!s || s === '-' || s === '.' || s === '-.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Formats a number with thousand separators (US locale, `,` thousand / `.` decimal). */
export function formatNumber(n: number, decimals: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    useGrouping: true,
  });
}

/** Counts decimal digits between the start of `s` and `index` (excludes separators / sign). */
export function countDigitsBefore(s: string, index: number): number {
  let n = 0;
  for (let i = 0; i < Math.min(index, s.length); i++) {
    const c = s.charAt(i);
    if (c >= '0' && c <= '9') n++;
    else if (c === '.') n++; // keep the decimal as a "digit position" for caret tracking
  }
  return n;
}

/** Returns the index in `formatted` that sits **after** the first `n` digits + decimal. */
export function caretIndexAfterDigits(formatted: string, n: number): number {
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    const c = formatted.charAt(i);
    if ((c >= '0' && c <= '9') || c === '.') count++;
    if (count >= n) return i + 1;
  }
  return formatted.length;
}
