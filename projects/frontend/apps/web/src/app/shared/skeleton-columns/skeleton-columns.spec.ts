import { describe, expect, it } from 'vitest';

import { skeletonHeaderKeys, toSkeletonColumns, type SkeletonColumnDefs } from './skeleton-columns';

/**
 * How a page's column definitions become the skeleton's headers (#539). Pinned :
 *
 *  - **The skeleton follows the columns shown**, in their order — a column without a definition
 *    still gets its cell, empty-headed, so the table keeps its shape.
 *  - **A header is a translation key, a literal symbol, or nothing.**
 *  - **A unit joins its header only once translated** — before the files land a bare « () » used
 *    to flash under the amount columns, on exactly the load the skeleton exists for.
 */
describe('skeleton columns', () => {
  const defs: SkeletonColumnDefs = {
    ticker: { key: 'fields.ticker', variant: 'ticker' },
    amount: { key: 'fields.amount', unitKey: 'units.usd', variant: 'numeric' },
    balance: { key: 'fields.balance', unitKey: 'units.usd', variant: 'numeric' },
    completed: { text: '✓', variant: 'blank', width: '36px' },
    actions: { variant: 'actions' },
  };
  const labels = { 'fields.ticker': 'Ticker', 'fields.amount': 'Amount', 'units.usd': 'USD' };

  it('lists every key to translate, units included, once each', () => {
    expect(skeletonHeaderKeys(defs)).toEqual([
      'fields.ticker',
      'fields.amount',
      'units.usd',
      'fields.balance',
    ]);
  });

  it('builds the columns in the order shown, with their variant and width', () => {
    const columns = toSkeletonColumns(['ticker', 'completed', 'actions'], defs, labels);

    expect(columns).toEqual([
      { label: 'Ticker', variant: 'ticker', width: undefined },
      { label: '✓', variant: 'blank', width: '36px' },
      { label: '', variant: 'actions', width: undefined },
    ]);
  });

  it('puts the unit in brackets after its header', () => {
    expect(toSkeletonColumns(['amount'], defs, labels)[0].label).toBe('Amount (USD)');
  });

  it('leaves the unit out until it is translated, never a bare « () »', () => {
    expect(toSkeletonColumns(['amount'], defs, {})[0].label).toBe('');
    expect(toSkeletonColumns(['amount'], defs, { 'fields.amount': 'Amount' })[0].label).toBe(
      'Amount',
    );
  });

  it('keeps a column without a definition, empty-headed, so the table keeps its shape', () => {
    expect(toSkeletonColumns(['unknown'], defs, labels)).toEqual([
      { label: '', variant: undefined, width: undefined },
    ]);
  });
});
