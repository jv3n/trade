import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HttpStatsRepository } from './stats.http';

/**
 * Pins the read-path wire ↔ domain mapping inside [HttpStatsRepository]. The import / export
 * legs are dumb passthroughs (multipart / blob) ; the interesting contract is [findAll] :
 *
 *  - **Pagination wire shape** — page coordinates leave as `?page=N&size=N`, and a user sort
 *    leaves as `?sort=field,direction` **plus** a `createdAt,desc` tie-breaker so low-cardinality
 *    sorts stay deterministic across pages.
 *  - **No params when no PageRequest** — relies on the backend `@PageableDefault`, doesn't send
 *    `?page=&size=`.
 *  - **Spring `Page<T>` unwrap** — `number` is renamed to `pageIndex` on the way back.
 *  - **Date parsing preserves the local day** — `tradeDate: '2026-06-04'` comes back as midnight
 *    local (June 4), not UTC-shifted ; timestamps become `Date` instances.
 */
describe('HttpStatsRepository', () => {
  let repo: HttpStatsRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpStatsRepository],
    });
    repo = TestBed.inject(HttpStatsRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('findAll without a PageRequest calls GET /api/stats with no query params', () => {
    repo.findAll().subscribe();
    const req = http.expectOne('/api/stats');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(wirePageFixture([]));
  });

  it('findAll forwards page + size when a PageRequest is passed', () => {
    repo.findAll(undefined, { pageIndex: 2, pageSize: 50 }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/stats');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('50');
    req.flush(wirePageFixture([]));
  });

  it('findAll forwards the filter axes as query params', () => {
    repo
      .findAll(
        {
          query: 'gels',
          dateFrom: new Date(2026, 5, 1),
          dateTo: new Date(2026, 5, 30),
          source: 'RADAR',
          gapMin: 50,
          gapMax: 90,
        },
        { pageIndex: 0, pageSize: 25 },
      )
      .subscribe();
    const req = http.expectOne((r) => r.url === '/api/stats');
    expect(req.request.params.get('q')).toBe('gels');
    expect(req.request.params.get('dateFrom')).toBe('2026-06-01');
    expect(req.request.params.get('dateTo')).toBe('2026-06-30');
    expect(req.request.params.get('source')).toBe('RADAR');
    expect(req.request.params.get('gapMin')).toBe('50');
    expect(req.request.params.get('gapMax')).toBe('90');
    req.flush(wirePageFixture([]));
  });

  it('findAll appends a createdAt,desc tie-breaker after the user sort', () => {
    repo
      .findAll(undefined, {
        pageIndex: 0,
        pageSize: 25,
        sortField: 'pushPercent',
        sortDirection: 'desc',
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === '/api/stats');
    expect(req.request.params.getAll('sort')).toEqual(['pushPercent,desc', 'createdAt,desc']);
    req.flush(wirePageFixture([]));
  });

  it('findAll skips the sort param when sortField or sortDirection is missing', () => {
    repo.findAll(undefined, { pageIndex: 0, pageSize: 25, sortField: 'pushPercent' }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/stats');
    expect(req.request.params.has('sort')).toBe(false);
    req.flush(wirePageFixture([]));
  });

  it('findAll renames Spring `number` to `pageIndex` on the way back', () => {
    repo.findAll(undefined, { pageIndex: 1, pageSize: 25 }).subscribe((result) => {
      expect(result.pageIndex).toBe(1);
      expect(result.pageSize).toBe(25);
      expect(result.totalElements).toBe(80);
      expect(result.totalPages).toBe(4);
      expect(result.content).toHaveLength(1);
    });
    const req = http.expectOne((r) => r.url === '/api/stats');
    req.flush({ content: [wireFixture()], number: 1, size: 25, totalElements: 80, totalPages: 4 });
  });

  it('parses tradeDate as midnight local (not UTC) to preserve the day', () => {
    repo.findAll().subscribe((result) => {
      const e = result.content[0];
      expect(e.tradeDate).toBeInstanceOf(Date);
      expect(e.tradeDate.getFullYear()).toBe(2026);
      expect(e.tradeDate.getMonth()).toBe(5);
      expect(e.tradeDate.getDate()).toBe(4);
      expect(e.createdAt).toBeInstanceOf(Date);
      expect(e.updatedAt).toBeInstanceOf(Date);
    });
    http.expectOne('/api/stats').flush(wirePageFixture([wireFixture({ tradeDate: '2026-06-04' })]));
  });

  it('carries the derived percentages and boolean flags through to the domain shape', () => {
    repo.findAll().subscribe((result) => {
      const e = result.content[0];
      expect(e.pushPercent).toBe(5.95);
      expect(e.lodPercent).toBe(-27.38);
      expect(e.eodPercent).toBe(-26.19);
      expect(e.ssr).toBe(true);
      expect(e.under1Dollar).toBe(false);
    });
    http
      .expectOne('/api/stats')
      .flush(
        wirePageFixture([
          wireFixture({ pushPercent: 5.95, lodPercent: -27.38, eodPercent: -26.19, ssr: true }),
        ]),
      );
  });

  it('maps a RADAR partial row — source + null setup/outcome columns pass through as null', () => {
    repo.findAll().subscribe((result) => {
      const e = result.content[0];
      expect(e.source).toBe('RADAR');
      expect(e.createdBy).toBe('user-42');
      expect(e.floatSharesMillions).toBeNull();
      expect(e.highPrice).toBeNull();
      expect(e.pushPercent).toBeNull();
      expect(e.ssr).toBeNull();
    });
    http.expectOne('/api/stats').flush(
      wirePageFixture([
        wireFixture({
          source: 'RADAR',
          createdBy: 'user-42',
          floatSharesMillions: null,
          institutionsPercent: null,
          instOver20: null,
          under1Dollar: null,
          ssr: null,
          entryAfter11am: null,
          highPrice: null,
          lodPrice: null,
          eodPrice: null,
          pushPercent: null,
          lodPercent: null,
          eodPercent: null,
        }),
      ]),
    );
  });

  it('createFromRadar POSTs the scan-time fields + source RADAR to /api/stats', () => {
    repo
      .createFromRadar({ ticker: 'GELS', gapUpPercent: 72, openPrice: 3.5 })
      .subscribe((created) => {
        expect(created.ticker).toBe('GELS');
        expect(created.source).toBe('RADAR');
      });
    const req = http.expectOne('/api/stats');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      ticker: 'GELS',
      gapUpPercent: 72,
      openPrice: 3.5,
      source: 'RADAR',
    });
    req.flush(wireFixture({ ticker: 'GELS', source: 'RADAR', createdBy: 'user-42' }));
  });

  it('create POSTs the manual form (date as YYYY-MM-DD, source MANUAL)', () => {
    repo.create(manualInput()).subscribe((created) => expect(created.ticker).toBe('BAC'));
    const req = http.expectOne('/api/stats');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({
      ticker: 'GELS',
      tradeDate: '2026-06-11',
      source: 'MANUAL',
      highPrice: 4.5,
      note: 'clean fade',
    });
    req.flush(wireFixture());
  });

  it('update PUTs to /api/stats/{id}', () => {
    repo.update('row-1', manualInput()).subscribe();
    const req = http.expectOne('/api/stats/row-1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toMatchObject({ ticker: 'GELS', source: 'MANUAL' });
    req.flush(wireFixture());
  });

  it('delete DELETEs /api/stats/{id}', () => {
    repo.delete('row-1').subscribe();
    const req = http.expectOne('/api/stats/row-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});

/** Domain [StatEntryInput] for the manual create/edit path. */
function manualInput() {
  return {
    tradeDate: new Date(2026, 5, 11),
    ticker: 'gels',
    gapUpPercent: 72,
    openPrice: 3.5,
    floatSharesMillions: 4.2,
    institutionsPercent: null,
    instOver20: false,
    under1Dollar: true,
    ssr: false,
    entryAfter11am: false,
    highPrice: 4.5,
    lodPrice: null,
    eodPrice: null,
    note: 'clean fade',
    source: 'MANUAL' as const,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function wireFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'fixture-id',
    tradeDate: '2026-06-04',
    ticker: 'BAC',
    gapUpPercent: 52.0,
    openPrice: 4.2,
    floatSharesMillions: 12.5,
    institutionsPercent: 8.3,
    instOver20: false,
    under1Dollar: false,
    ssr: false,
    entryAfter11am: false,
    note: null,
    highPrice: 4.45,
    lodPrice: 3.05,
    eodPrice: 3.1,
    pushPercent: 5.95,
    lodPercent: -27.38,
    eodPercent: -26.19,
    source: 'IMPORT',
    createdBy: null,
    createdAt: '2026-06-04T15:30:00Z',
    updatedAt: '2026-06-04T15:30:00Z',
    ...overrides,
  };
}

/** Spring `Page<T>` wire shape — default page 0 / size 25, totals derived from content length. */
function wirePageFixture(content: ReturnType<typeof wireFixture>[]) {
  return {
    content,
    number: 0,
    size: 25,
    totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1,
  };
}
