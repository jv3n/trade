import { Type } from '@angular/core';
import { AvgCard } from './cards/avg-card';
import { MoveCard } from './cards/move-card';
import { PnlCard } from './cards/pnl-card';
import { RrCard } from './cards/rr-card';
import { SizeCard } from './cards/size-card';

export type CalculatorKey = 'move' | 'size' | 'pnl' | 'rr' | 'avg';

/** One calculator : what the launcher and a floating widget need to show it. */
export interface Calculator {
  key: CalculatorKey;
  /** Translation keys of the title, and of the sentence under it that says what it is for. */
  title: string;
  description: string;
  icon: string;
  card: Type<unknown>;
}

/**
 * The calculators, in the order of the launcher's menu (#421). Adding one is an entry here : the
 * menu and the widgets both read this list.
 */
export const CALCULATORS: readonly Calculator[] = [
  {
    key: 'move',
    title: 'calculator.move.title',
    description: 'calculator.move.description',
    icon: 'percent',
    card: MoveCard,
  },
  {
    key: 'size',
    title: 'calculator.size.title',
    description: 'calculator.size.description',
    icon: 'straighten',
    card: SizeCard,
  },
  {
    key: 'pnl',
    title: 'calculator.pnl.title',
    description: 'calculator.pnl.description',
    icon: 'payments',
    card: PnlCard,
  },
  {
    key: 'rr',
    title: 'calculator.rr.title',
    description: 'calculator.rr.description',
    icon: 'compare_arrows',
    card: RrCard,
  },
  {
    key: 'avg',
    title: 'calculator.avg.title',
    description: 'calculator.avg.description',
    icon: 'stacked_line_chart',
    card: AvgCard,
  },
];

export function calculator(key: CalculatorKey): Calculator {
  return CALCULATORS.find((c) => c.key === key)!;
}
