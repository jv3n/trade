import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { movementsQueryFrom, toMovementsParams } from './movements-query';

/**
 * The link a report segment opens the account with (#739) : a range of days and a type, in the
 * URL so « Back » and a kept link work. A link that does not hold — half of it, days out of order, a
 * type the account does not know — names no filter, and the page opens on its own default rather
 * than on a list that is not the one promised.
 */
function read(params: Record<string, string>) {
  return movementsQueryFrom(convertToParamMap(params));
}

describe('movementsQuery', () => {
  it('writes days, and reads them back as the same filter', () => {
    const query = {
      dateFrom: new Date(2026, 8, 14),
      dateTo: new Date(2026, 8, 20),
      type: 'trades' as const,
    };

    const params = toMovementsParams(query);

    expect(params).toEqual({ from: '2026-09-14', to: '2026-09-20', type: 'trades' });
    expect(read(params)).toEqual(query);
  });

  it('names no filter when the link holds only part of one', () => {
    expect(read({})).toBeNull();
    expect(read({ from: '2026-09-14', type: 'trades' })).toBeNull();
    expect(read({ from: '2026-09-14', to: '2026-09-20' })).toBeNull();
  });

  it('names no filter for days out of order, a broken day or an unknown type', () => {
    expect(read({ from: '2026-09-20', to: '2026-09-14', type: 'trades' })).toBeNull();
    expect(read({ from: '2026-13-40', to: '2026-09-20', type: 'trades' })).toBeNull();
    expect(read({ from: '2026-09-14', to: '2026-09-20', type: 'costs' })).toBeNull();
  });
});
