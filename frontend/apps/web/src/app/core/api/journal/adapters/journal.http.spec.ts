import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TradeEntryInput } from '../trade-entry.model';
import { HttpJournalRepository } from './journal.http';

/**
 * Pins the wire ↔ domain mapping inside [HttpJournalRepository]. Four things this test
 * catches that a typecheck alone can't :
 *
 *  - **Date round-trip preserves the user's local day** — `tradeDate: '2026-06-04'` from the
 *    backend must come back as `new Date(2026, 5, 4)` (midnight local), and a Date passed in
 *    must serialise back to the same `YYYY-MM-DD`. Native `new Date(string)` would parse as
 *    UTC and shift the day in negative-TZ zones ; we use `date-fns` to avoid that, this test
 *    pins the contract.
 *  - **Ticker normalisation** — `toWire` calls `.trim().toUpperCase()` on the ticker. A bug
 *    here would send mixed-case tickers to the backend and trigger duplicate-row anxiety.
 *  - **Filter query-param building** — multi-value (`plays`, `patterns`) must use the
 *    repeated `?play=A&play=B` form ; null / empty / blank values must be **omitted**, not
 *    sent as `?q=&dateFrom=` (which the backend would parse as empty-string filter and
 *    return nothing).
 *  - **Pagination wire shape** — page coordinates land as `?page=N&size=N&sort=field,direction`
 *    on the way out, and Spring's `Page<T>` body unwraps into our `PagedResult<T>` shape with
 *    `number` renamed to `pageIndex`.
 */
describe('HttpJournalRepository', () => {
  let repo: HttpJournalRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpJournalRepository],
    });
    repo = TestBed.inject(HttpJournalRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ---------------------------------------------------------------------------
  // findAll — URL + filter param building
  // ---------------------------------------------------------------------------

  it('findAll without filter calls GET /api/journal/trades with no query params', () => {
    repo.findAll().subscribe();
    const req = http.expectOne('/api/journal/trades');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(wirePageFixture([]));
  });

  it('findAll with query trims and forwards as ?q=', () => {
    repo.findAll({ query: '  aapl  ' }).subscribe();
    const req = http.expectOne((r) => r.params.get('q') === 'aapl');
    req.flush(wirePageFixture([]));
  });

  it('findAll with blank query omits the q param entirely (avoids empty-string filter)', () => {
    repo.findAll({ query: '   ' }).subscribe();
    const req = http.expectOne('/api/journal/trades');
    expect(req.request.params.has('q')).toBe(false);
    req.flush(wirePageFixture([]));
  });

  it('findAll formats dateFrom / dateTo as yyyy-MM-dd using the local day', () => {
    repo.findAll({ dateFrom: new Date(2026, 5, 1), dateTo: new Date(2026, 5, 30) }).subscribe();
    const req = http.expectOne(
      (r) =>
        r.url === '/api/journal/trades' &&
        r.params.get('dateFrom') === '2026-06-01' &&
        r.params.get('dateTo') === '2026-06-30',
    );
    req.flush(wirePageFixture([]));
  });

  it('findAll repeats play and pattern params for multi-value filters', () => {
    repo.findAll({ plays: ['A', 'B'], patterns: ['GUS'] }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/journal/trades');
    expect(req.request.params.getAll('play')).toEqual(['A', 'B']);
    expect(req.request.params.getAll('pattern')).toEqual(['GUS']);
    req.flush(wirePageFixture([]));
  });

  it('findAll omits empty arrays (no-filter on that axis)', () => {
    repo.findAll({ plays: [], patterns: [] }).subscribe();
    const req = http.expectOne('/api/journal/trades');
    expect(req.request.params.has('play')).toBe(false);
    expect(req.request.params.has('pattern')).toBe(false);
    req.flush(wirePageFixture([]));
  });

  it('findAll forwards status as ?status=', () => {
    repo.findAll({ status: 'PROFITABLE' }).subscribe();
    const req = http.expectOne((r) => r.params.get('status') === 'PROFITABLE');
    req.flush(wirePageFixture([]));
  });

  // ---------------------------------------------------------------------------
  // findAll — pagination params
  // ---------------------------------------------------------------------------

  it('findAll omits pagination params when no PageRequest is passed (relies on backend defaults)', () => {
    repo.findAll().subscribe();
    const req = http.expectOne('/api/journal/trades');
    expect(req.request.params.has('page')).toBe(false);
    expect(req.request.params.has('size')).toBe(false);
    expect(req.request.params.has('sort')).toBe(false);
    req.flush(wirePageFixture([]));
  });

  it('findAll forwards page + size when a PageRequest is passed', () => {
    repo.findAll(undefined, { pageIndex: 2, pageSize: 25 }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/journal/trades');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('25');
    req.flush(wirePageFixture([]));
  });

  it('findAll forwards sort as `field,direction` when both are provided', () => {
    repo
      .findAll(undefined, { pageIndex: 0, pageSize: 10, sortField: 'ticker', sortDirection: 'asc' })
      .subscribe();
    const req = http.expectOne((r) => r.url === '/api/journal/trades');
    expect(req.request.params.get('sort')).toBe('ticker,asc');
    req.flush(wirePageFixture([]));
  });

  it('findAll skips the sort param when sortField or sortDirection is missing', () => {
    repo.findAll(undefined, { pageIndex: 0, pageSize: 10, sortField: 'ticker' }).subscribe();
    // Predicate match — when a PageRequest is forwarded, the URL carries `?page=0&size=10`
    // and a plain `expectOne('/api/journal/trades')` would fail to match (string match
    // requires the full URL incl. query string).
    const req = http.expectOne((r) => r.url === '/api/journal/trades');
    expect(req.request.params.has('sort')).toBe(false);
    req.flush(wirePageFixture([]));
  });

  it('findAll renames Spring `number` to `pageIndex` on the way back', () => {
    repo.findAll(undefined, { pageIndex: 1, pageSize: 10 }).subscribe((result) => {
      expect(result.pageIndex).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalElements).toBe(42);
      expect(result.totalPages).toBe(5);
      expect(result.content).toHaveLength(1);
    });
    const req = http.expectOne((r) => r.url === '/api/journal/trades');
    req.flush({
      content: [wireFixture()],
      number: 1,
      size: 10,
      totalElements: 42,
      totalPages: 5,
    });
  });

  // ---------------------------------------------------------------------------
  // findAll — wire → domain mapping
  // ---------------------------------------------------------------------------

  it('parses tradeDate as midnight local (not UTC) to preserve the user’s day', () => {
    repo.findAll().subscribe((result) => {
      const entry = result.content[0];
      expect(entry.tradeDate).toBeInstanceOf(Date);
      // Local day must be 4 (June 4), not 3 (June 3) — which is what `new Date('2026-06-04')`
      // would produce in negative-UTC timezones because the native parse treats it as UTC.
      expect(entry.tradeDate.getFullYear()).toBe(2026);
      expect(entry.tradeDate.getMonth()).toBe(5);
      expect(entry.tradeDate.getDate()).toBe(4);
    });
    http.expectOne('/api/journal/trades').flush(
      wirePageFixture([
        {
          ...wireFixture(),
          tradeDate: '2026-06-04',
        },
      ]),
    );
  });

  it('parses createdAt / updatedAt as Date instances', () => {
    repo.findAll().subscribe((result) => {
      const entry = result.content[0];
      expect(entry.createdAt).toBeInstanceOf(Date);
      expect(entry.updatedAt).toBeInstanceOf(Date);
    });
    http.expectOne('/api/journal/trades').flush(wirePageFixture([wireFixture()]));
  });

  // ---------------------------------------------------------------------------
  // create / update — domain → wire mapping
  // ---------------------------------------------------------------------------

  it('create POSTs with uppercased trimmed ticker and yyyy-MM-dd date', () => {
    repo.create(inputFixture({ ticker: '  aapl  ', tradeDate: new Date(2026, 5, 4) })).subscribe();
    const req = http.expectOne('/api/journal/trades');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.ticker).toBe('AAPL');
    expect(req.request.body.tradeDate).toBe('2026-06-04');
    req.flush(wireFixture());
  });

  it('create maps blank note / errorNote to null on the wire', () => {
    repo.create(inputFixture({ note: '   ', errorNote: '' })).subscribe();
    const req = http.expectOne('/api/journal/trades');
    expect(req.request.body.note).toBeNull();
    expect(req.request.body.errorNote).toBeNull();
    req.flush(wireFixture());
  });

  it('update PUTs to /:id with the same wire shape', () => {
    repo.update('abc-123', inputFixture({ ticker: 'tsla' })).subscribe();
    const req = http.expectOne('/api/journal/trades/abc-123');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.ticker).toBe('TSLA');
    req.flush(wireFixture({ id: 'abc-123' }));
  });

  it('delete sends DELETE /:id with no body', () => {
    repo.delete('abc-123').subscribe();
    const req = http.expectOne('/api/journal/trades/abc-123');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('findById sends GET /:id and maps the wire DTO to a domain TradeEntry', () => {
    repo.findById('abc-123').subscribe((entry) => {
      expect(entry.id).toBe('abc-123');
      expect(entry.tradeDate).toBeInstanceOf(Date);
    });
    http.expectOne('/api/journal/trades/abc-123').flush(wireFixture({ id: 'abc-123' }));
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function wireFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'fixture-id',
    tradeDate: '2026-06-04',
    ticker: 'AAPL',
    play: 'A',
    pattern: 'GUS',
    size: 100,
    openPrice: 3.21,
    exitPrice: null,
    profitDollars: null,
    gainPercent: null,
    note: null,
    pre935To10h: null,
    preGapUp50: null,
    prePrice1To10: null,
    preFloat3To50m: null,
    preWaitPush: null,
    openSide: null,
    shortOnResistance: null,
    exitStrategy: null,
    errorNote: null,
    createdAt: '2026-06-04T15:30:00Z',
    updatedAt: '2026-06-04T15:30:00Z',
    ...overrides,
  };
}

/**
 * Spring `Page<T>` wire shape. Default pageIndex 0 / size 10 / totalElements derived from the
 * content length — overrideable when a test wants to assert a specific paging contract.
 */
function wirePageFixture(content: ReturnType<typeof wireFixture>[]) {
  return {
    content,
    number: 0,
    size: 10,
    totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1,
  };
}

function inputFixture(overrides: Partial<TradeEntryInput> = {}): TradeEntryInput {
  return {
    tradeDate: new Date(2026, 5, 4),
    ticker: 'AAPL',
    play: 'A',
    pattern: 'GUS',
    size: 100,
    openPrice: 3.21,
    exitPrice: null,
    profitDollars: null,
    gainPercent: null,
    note: null,
    pre935To10h: null,
    preGapUp50: null,
    prePrice1To10: null,
    preFloat3To50m: null,
    preWaitPush: null,
    openSide: null,
    shortOnResistance: null,
    exitStrategy: null,
    errorNote: null,
    ...overrides,
  };
}
