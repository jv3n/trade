import { Injectable, inject, signal } from '@angular/core';
import { AccountRepository } from '../../core/api/account/account.repository';

/** Every field of the calculators, card by card (#388). */
export interface CalculatorValues {
  /** Shared by the two sizing cards (#496), prefilled from the account. */
  balance: number | null;
  moveFrom: number | null;
  moveTo: number | null;
  moveBase: number | null;
  movePercent: number | null;
  maxPrice: number | null;
  /** % of the balance not to exceed ; empty, it caps nothing. */
  maxCeiling: number | null;
  /** $ per share. */
  maxLocate: number | null;
  /** % of the balance. */
  sizeRisk: number | null;
  sizeOpen: number | null;
  /** % above the open. */
  sizeStop: number | null;
  sizeCurrent: number | null;
  rrPrice: number | null;
  rrStop: number | null;
  rrTarget: number | null;
  /** The broker rules, shared by the two sizing cards (#496). */
  leverage: number | null;
  /** $ per share. */
  marginFloor: number | null;
  lot: number | null;
  /** % of the buying power left unused. */
  safety: number | null;
}

export type CalculatorField = keyof CalculatorValues;

/** The two stops of the tracker's calculator tabs, in % above the open (#496). */
export const STOP_PRESETS: readonly number[] = [40, 31];

/**
 * The settings, not the figures of a trade : kept in the browser from one visit to the next (#496).
 * Their defaults are the ones `docs/notes/tradezero-margin.md` lists — change both together.
 */
const SETTINGS = {
  sizeStop: STOP_PRESETS[0],
  maxCeiling: null,
  leverage: 2,
  marginFloor: 2.5,
  lot: 100,
  safety: 5,
} satisfies Partial<CalculatorValues>;

type SettingField = keyof typeof SETTINGS;

const STORAGE_KEY = 'calculator.settings';

const EMPTY: CalculatorValues = {
  balance: null,
  moveFrom: null,
  moveTo: null,
  moveBase: null,
  movePercent: null,
  maxPrice: null,
  maxCeiling: null,
  maxLocate: null,
  sizeRisk: null,
  sizeOpen: null,
  sizeStop: null,
  sizeCurrent: null,
  rrPrice: null,
  rrStop: null,
  rrTarget: null,
  leverage: null,
  marginFloor: null,
  lot: null,
  safety: null,
};

/**
 * What is typed in the calculators, held in memory at the root so it survives a widget being closed
 * and opened again, or a trip to another page. The figures are not persisted : a reload starts them
 * over, on purpose (#388). Two exceptions (#496) : the account balance is read, and the settings are
 * remembered.
 */
@Injectable({ providedIn: 'root' })
export class CalculatorStore {
  private readonly account = inject(AccountRepository);
  private readonly _values = signal<CalculatorValues>({ ...EMPTY, ...SETTINGS, ...readSettings() });
  readonly values = this._values.asReadonly();
  private balanceRequested = false;

  set(field: CalculatorField, value: number | null): void {
    this._values.update((v) => ({ ...v, [field]: value }));
    if (field in SETTINGS) writeSettings(this._values());
  }

  /**
   * Prefills the balance from the account, once per page load — a balance edited or cleared since
   * stays as typed. Unreachable, the field is just left for the user to type.
   */
  prefillBalance(): void {
    if (this.balanceRequested) return;
    this.balanceRequested = true;
    this.account.getSummary().subscribe({
      next: (summary) => {
        if (this._values().balance === null) this.set('balance', summary.balance);
      },
      error: () => undefined,
    });
  }
}

/** Storage can be blocked or hold anything : only a number or null per known field is taken. */
function readSettings(): Partial<CalculatorValues> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      (Object.keys(SETTINGS) as SettingField[])
        .filter((f) => f in stored && (stored[f] === null || typeof stored[f] === 'number'))
        .map((f) => [f, stored[f]]),
    );
  } catch {
    return {};
  }
}

function writeSettings(values: CalculatorValues): void {
  try {
    const settings = Object.fromEntries(
      (Object.keys(SETTINGS) as SettingField[]).map((f) => [f, values[f]]),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage : the settings last the session, like the figures.
  }
}
