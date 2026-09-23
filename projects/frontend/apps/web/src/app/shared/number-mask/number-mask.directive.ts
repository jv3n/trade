import { NumberSymbol, getLocaleNumberSymbol } from '@angular/common';
import {
  Directive,
  ElementRef,
  HostListener,
  LOCALE_ID,
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
 *   - Focusing the field selects its content, so typing replaces the value instead of appending
 *     to it (`15,3` then `200` gave `15200`).
 *
 * Formatting :
 *   - **The locale's decimal separator, no thousand grouping** (`3,21` in French, `3.21` in
 *     English) — one setting drives the language and the formats alike (#311, `PARCOURS.md` >
 *     Interface principles). Typing accepts both `.` and `,` whatever the locale. The internal
 *     numeric value is always a plain JS number ; only the *display* follows the locale. The caret
 *     is preserved across the reformat (tracked by digit / separator index).
 *   - **Blur pads to [decimals]** (#335) : a money field left at `618.2` shows `618.20`, so a
 *     column of amounts lines up on the separator. An empty field stays empty.
 *   - **Thousands are grouped at rest, never while typing** (#356) : a field left alone reads
 *     `1 234,56` like the table beside it, and focusing it strips the grouping back to `1234,56`
 *     so the caret tracking keeps working on digits alone.
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
  private readonly locale = inject(LOCALE_ID);
  private readonly separator = getLocaleNumberSymbol(this.locale, NumberSymbol.Decimal);
  private readonly group = getLocaleNumberSymbol(this.locale, NumberSymbol.Group);

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

  private selectOnMouseUp = false;

  constructor() {
    // `matInput` consumes `[value]` too and writes the raw number (`1500`, `1.3`) first, so a
    // field at rest is compared on its text, not its parsed value (#363). While typing, only a
    // text that no longer means the value is replaced, so the caret is not clobbered.
    effect(() => {
      const v = this.value();
      const el = this.host.nativeElement;
      if (document.activeElement === el) {
        if (this.parse(el.value) !== v) {
          el.value = v === null ? '' : formatNumber(v, this.decimals(), this.separator, true);
        }
        return;
      }
      const wanted = v === null ? '' : this.atRest(v);
      if (el.value !== wanted) el.value = wanted;
    });
  }

  @HostListener('mousedown')
  onMouseDown(): void {
    this.selectOnMouseUp = document.activeElement !== this.host.nativeElement;
  }

  @HostListener('focus')
  onFocus(): void {
    const el = this.host.nativeElement;
    // Typing happens on the plain form : the caret is tracked by digit index, and separators
    // appearing mid-entry would move it under the user's fingers (#356). Grouping comes back on
    // the way out, where it lines the field up with the table beside it.
    const num = this.parse(el.value);
    if (num !== null) el.value = formatNumber(num, this.decimals(), this.separator, true);
    el.select();
  }

  /**
   * Reads the field's text back to a number. The group separator goes **first** : in English it is
   * a comma, which [parseNumber] would otherwise take for the decimal point and reject the whole
   * value (`1,234.5` → `NaN`). Typed text never carries grouping — the field is stripped on focus.
   */
  private parse(text: string): number | null {
    return parseNumber(this.group ? text.split(this.group).join('') : text);
  }

  /** How a value reads when nobody is typing in it : padded, grouped, in the page's locale. */
  private atRest(value: number): string {
    return formatNumber(value, this.decimals(), this.separator, true, this.group);
  }

  // The click that focuses the field would otherwise drop the selection on mouseup and leave a
  // caret. Only that first click : a click in an already focused field still places the caret.
  @HostListener('mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (!this.selectOnMouseUp) return;
    this.selectOnMouseUp = false;
    event.preventDefault();
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
    const formatted = cleaned.replace('.', this.separator);
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
    el.value = num === null ? '' : this.atRest(num);
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
 * Formats a number with [separator] and no thousand grouping (`1234,56`). Manual rather than
 * `Intl` so the display is deterministic across environments. `decimals` caps the fractional
 * digits ; [pad] fills them to that many, which is what a field shows once left (#335) — while
 * typing, trailing zeros must survive as typed, so padding stays off.
 */
export function formatNumber(
  n: number,
  decimals: number,
  separator = ',',
  pad = false,
  group = '',
): string {
  const negative = n < 0;
  // Round to `decimals` then drop trailing zeros via Number's own toString (dot decimal).
  // Values here are small monetary numbers — no exponential-notation risk.
  const abs = Math.abs(n);
  const s = pad ? abs.toFixed(decimals) : Number(abs.toFixed(decimals)).toString();
  const [whole, fraction] = s.split('.');
  const grouped = group ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, group) : whole;
  const body = fraction === undefined ? grouped : grouped + separator + fraction;
  return (negative ? '-' : '') + body;
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
