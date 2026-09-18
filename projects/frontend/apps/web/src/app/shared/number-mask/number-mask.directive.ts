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
 *   - Only `0-9`, `.`, `,` are allowed. Both `.` and `,` act as the decimal separator on input.
 *   - At most one decimal separator. Extra ones are dropped.
 *   - Decimals beyond `[decimals]` are truncated (default 2).
 *   - Optional `[allowNegative]` lets a leading `-` through.
 *
 * Formatting :
 *   - **Comma decimal separator, no thousand grouping** (`3,21`, `1234,56`). French-style — the
 *     app is FR-first and the monetary fields read more naturally with a comma. The internal
 *     numeric value is always a plain JS number ; only the *display* uses the comma. The caret is
 *     preserved across the reformat (tracked by digit / separator index).
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

    // Display the cleaned value with a comma decimal separator. We keep exactly what the user
    // typed (no `toLocaleString` round-trip) so trailing zeros survive while typing — e.g.
    // "12,50" stays "12,50" instead of collapsing to "12,5" mid-entry. Blur does the canonical
    // reformat.
    const formatted = cleaned.replace('.', ',');
    el.value = formatted;

    // Restore caret — find the position in `formatted` that comes after `caretDigits` positions
    // (digits + decimal separator, and the optional leading minus sign).
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

/**
 * Parses a string to a number. Tolerates either decimal separator (`.` or `,`) so it works both
 * on the canonical cleaned form (dot) and on the displayed value (comma). Returns `null` for
 * blank / lone `-` / lone separator.
 */
export function parseNumber(s: string): number | null {
  const normalized = s.replace(/,/g, '.');
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Formats a number with a comma decimal separator and no thousand grouping (`1234,56`). Manual /
 * locale-independent so the display is deterministic across environments. `decimals` caps the
 * fractional digits (max, not min — no zero-padding).
 */
export function formatNumber(n: number, decimals: number): string {
  const negative = n < 0;
  // Round to `decimals` then drop trailing zeros via Number's own toString (dot decimal, no
  // grouping). Values here are small monetary numbers — no exponential-notation risk.
  const rounded = Number(Math.abs(n).toFixed(decimals));
  const s = rounded.toString().replace('.', ',');
  return negative ? '-' + s : s;
}

/**
 * Counts positions (digits + the decimal separator) between the start of `s` and `index`. Either
 * separator counts so caret tracking works on both the typed (`,` or `.`) and displayed (`,`)
 * forms.
 */
export function countDigitsBefore(s: string, index: number): number {
  let n = 0;
  for (let i = 0; i < Math.min(index, s.length); i++) {
    const c = s.charAt(i);
    if (c >= '0' && c <= '9') n++;
    else if (c === '.' || c === ',') n++; // decimal separator is a "position" for caret tracking
  }
  return n;
}

/** Returns the index in `formatted` that sits **after** the first `n` positions (digits + sep). */
export function caretIndexAfterDigits(formatted: string, n: number): number {
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    const c = formatted.charAt(i);
    if ((c >= '0' && c <= '9') || c === '.' || c === ',') count++;
    if (count >= n) return i + 1;
  }
  return formatted.length;
}
