import { Injectable, signal } from '@angular/core';

/** Every field of the calculator page, card by card (#388). */
export interface CalculatorValues {
  moveFrom: number | null;
  moveTo: number | null;
  moveBase: number | null;
  movePercent: number | null;
  sizeRisk: number | null;
  sizeEntry: number | null;
  sizeStop: number | null;
  pnlEntry: number | null;
  pnlCover: number | null;
  pnlShares: number | null;
  pnlFees: number | null;
  rrPrice: number | null;
  rrStop: number | null;
  rrTarget: number | null;
  avgShares: number | null;
  avgPrice: number | null;
  avgAddShares: number | null;
  avgAddPrice: number | null;
}

export type CalculatorField = keyof CalculatorValues;

const EMPTY: CalculatorValues = {
  moveFrom: null,
  moveTo: null,
  moveBase: null,
  movePercent: null,
  sizeRisk: null,
  sizeEntry: null,
  sizeStop: null,
  pnlEntry: null,
  pnlCover: null,
  pnlShares: null,
  pnlFees: null,
  rrPrice: null,
  rrStop: null,
  rrTarget: null,
  avgShares: null,
  avgPrice: null,
  avgAddShares: null,
  avgAddPrice: null,
};

/**
 * What is typed in the calculator, held in memory at the root so it survives a trip to another page
 * and back. Nothing is persisted : a reload starts from empty, on purpose (#388).
 */
@Injectable({ providedIn: 'root' })
export class CalculatorStore {
  private readonly _values = signal<CalculatorValues>(EMPTY);
  readonly values = this._values.asReadonly();

  set(field: CalculatorField, value: number | null): void {
    this._values.update((v) => ({ ...v, [field]: value }));
  }
}
