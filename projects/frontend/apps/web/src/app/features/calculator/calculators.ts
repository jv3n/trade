import { Type } from '@angular/core';
import { MaxCard } from './cards/max-card';
import { MoveCard } from './cards/move-card';
import { RrCard } from './cards/rr-card';
import { SizeCard } from './cards/size-card';

export type CalculatorKey = 'move' | 'max' | 'size' | 'rr';

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
    key: 'max',
    title: 'calculator.max.title',
    description: 'calculator.max.description',
    icon: 'vertical_align_top',
    card: MaxCard,
  },
  {
    key: 'size',
    title: 'calculator.size.title',
    description: 'calculator.size.description',
    icon: 'straighten',
    card: SizeCard,
  },
  {
    key: 'rr',
    title: 'calculator.rr.title',
    description: 'calculator.rr.description',
    icon: 'compare_arrows',
    card: RrCard,
  },
];

export function calculator(key: CalculatorKey): Calculator {
  return CALCULATORS.find((c) => c.key === key)!;
}
