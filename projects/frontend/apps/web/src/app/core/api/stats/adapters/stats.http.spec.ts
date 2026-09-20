import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StatEntry, StatEntryInput } from '../stat-entry.model';
import { HttpStatsRepository } from './stats.http';

/**
 * Pins the wire ↔ domain mapping inside [HttpStatsRepository]. The import / export legs are dumb
 * passthroughs (multipart / blob) ; what matters here :
 *
 *  - **Pagination wire shape** — page coordinates leave as `?page=N&size=N`, and a user sort leaves
 *    as `?sort=field,direction` **plus** a `createdAt,desc` tie-breaker so low-cardinality sorts
 *    stay deterministic across pages.
 *  - **No params when no PageRequest** — relies on the backend `@PageableDefault`.
 *  - **Filter axes** — search / period / pattern / status travel as query params, and the summary
 *    endpoint reuses the very same ones.
 *  - **Spring `Page<T>` unwrap** — `number` is renamed to `pageIndex` on the way back.
 *  - **Date parsing preserves the local day** — `tradeDate: '2026-09-17'` comes back as midnight
 *    local (September 17), not UTC-shifted ; timestamps become `Date` instances.
 *  - **Update payload** — the date is serialised as a plain `yyyy-MM-dd`, the ticker upper-cased,
 *    and the server-owned fields (id, candidateId, completed, audit) never leave.
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
      .findAll({
        query: 'ktta',
        dateFrom: new Date(2026, 8, 1),
        dateTo: new Date(2026, 8, 30),
        pattern: 'GUS',
        status: 'TO_COMPLETE',
      })
      .subscribe();

    const req = http.expectOne((r) => r.url === '/api/stats');
    expect(req.request.params.get('q')).toBe('ktta');
    expect(req.request.params.get('dateFrom')).toBe('2026-09-01');
    expect(req.request.params.get('dateTo')).toBe('2026-09-30');
    expect(req.request.params.get('pattern')).toBe('GUS');
    expect(req.request.params.get('status')).toBe('TO_COMPLETE');
    req.flush(wirePageFixture([]));
  });

  it('findAll appends a createdAt tie-breaker after the user sort', () => {
    repo
      .findAll(undefined, {
        pageIndex: 0,
        pageSize: 25,
        sortField: 'ticker',
        sortDirection: 'asc',
      })
      .subscribe();

    const req = http.expectOne((r) => r.url === '/api/stats');
    expect(req.request.params.getAll('sort')).toEqual(['ticker,asc', 'createdAt,desc']);
    req.flush(wirePageFixture([]));
  });

  it('findById reads a single stat — the day context of a trade', () => {
    repo.findById('stat-1').subscribe((stat) => {
      expect(stat.ticker).toBe('KTTA');
      expect(stat.tradeDate.getDate()).toBe(17);
    });

    const req = http.expectOne('/api/stats/stat-1');
    expect(req.request.method).toBe('GET');
    req.flush(wireStat());
  });

  it('summary hits /api/stats/summary with the listing filter', () => {
    repo.summary({ status: 'COMPLETED' }).subscribe();

    const req = http.expectOne((r) => r.url === '/api/stats/summary');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('COMPLETED');
    req.flush({
      completed: 3,
      toComplete: 1,
      averagePushOpenPercent: 9.6,
      averageLodPercent: -12.3,
      fadeCount: 2,
      averageEodPercent: -3.7,
      traded: 2,
      untraded: 2,
    });
  });

  it('unwraps the Spring page and parses the dates on the local day', () => {
    let result: StatEntry[] = [];
    repo.findAll().subscribe((page) => {
      result = page.content;
      expect(page.pageIndex).toBe(1);
      expect(page.totalElements).toBe(21);
    });

    http.expectOne('/api/stats').flush({
      ...wirePageFixture([wireStat()]),
      number: 1,
      totalElements: 21,
    });

    const stat = result[0];
    expect(stat.tradeDate.getFullYear()).toBe(2026);
    expect(stat.tradeDate.getMonth()).toBe(8); // September, no UTC shift
    expect(stat.tradeDate.getDate()).toBe(17);
    expect(stat.createdAt).toBeInstanceOf(Date);
    expect(stat.completed).toBe(true);
    expect(stat.pushOpenPrice).toBe(4.62);
  });

  it('update sends the domain payload as the wire request', () => {
    repo.update('stat-1', makeInput()).subscribe();

    const req = http.expectOne('/api/stats/stat-1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      tradeDate: '2026-09-17',
      pattern: 'GUS',
      ticker: 'KTTA',
      previousClose: 2.65,
      pmOpen: 4.05,
      pmHigh: 4.65,
      floatMillions: 8.2,
      volumeMillions: 3.1,
      locatePerShare: 0.03,
      note: 'Résistance 4,65',
      openPrice: 4.2,
      pushOpenPrice: 4.62,
      hodPrice: 4.62,
      lodPrice: 3.41,
      eodPrice: 3.52,
      ssr: true,
      under1Dollar: false,
      entryAfter11am: false,
    });
    req.flush(wireStat());
  });

  it('promoteToTrade POSTs to /:id/trade and parses the journal trade that comes back', () => {
    // The response is a journal wire DTO, not a stat — the mapping is the journal adapter's, and
    // what the caller needs from it is the id to navigate to (#193).
    repo.promoteToTrade('stat-1').subscribe((trade) => {
      expect(trade.id).toBe('trade-9');
      expect(trade.statEntryId).toBe('stat-1');
      expect(trade.tradeDate).toBeInstanceOf(Date);
      expect(trade.tradeDate.getDate()).toBe(17);
    });

    const req = http.expectOne('/api/stats/stat-1/trade');
    expect(req.request.method).toBe('POST');
    req.flush({
      id: 'trade-9',
      statEntryId: 'stat-1',
      tradeDate: '2026-09-17',
      ticker: 'KTTA',
      pattern: 'GUS',
      direction: null,
      executions: [],
      size: null,
      openPrice: null,
      exitPrice: null,
      gainPercent: null,
      profitDollars: null,
      realProfitDollars: null,
      retainedProfitDollars: null,
      durationMinutes: null,
      note: null,
      errorNote: null,
      hasScreenshot: false,
      createdAt: '2026-09-17T12:00:00Z',
      updatedAt: '2026-09-17T12:00:00Z',
    });
  });

  it('a traded stat carries its trade link through the page mapping', () => {
    repo.findAll().subscribe((page) => {
      expect(page.content[0].tradeId).toBe('trade-9');
      expect(page.content[0].tradeRetainedProfitDollars).toBe(291.35);
    });

    http
      .expectOne('/api/stats')
      .flush(
        wirePageFixture([
          { ...wireStat(), tradeId: 'trade-9', tradeRetainedProfitDollars: 291.35 },
        ]),
      );
  });

  // ---- Fixtures --------------------------------------------------------------------------------

  /** KTTA on 09/17 — the example of `mockup/PARCOURS.md`, steps 1 and 5. */
  function wireStat() {
    return {
      id: 'stat-1',
      candidateId: 'cand-1',
      tradeDate: '2026-09-17',
      pattern: 'GUS',
      ticker: 'KTTA',
      previousClose: 2.65,
      pmOpen: 4.05,
      pmHigh: 4.65,
      floatMillions: 8.2,
      volumeMillions: 3.1,
      locatePerShare: 0.03,
      note: 'Résistance 4,65',
      openPrice: 4.2,
      pushOpenPrice: 4.62,
      hodPrice: 4.62,
      lodPrice: 3.41,
      eodPrice: 3.52,
      ssr: true,
      under1Dollar: false,
      entryAfter11am: false,
      completed: true,
      tradeId: null,
      tradeRetainedProfitDollars: null,
      createdAt: '2026-09-17T12:00:00Z',
      updatedAt: '2026-09-17T21:00:00Z',
    };
  }

  function makeInput(): StatEntryInput {
    return {
      tradeDate: new Date(2026, 8, 17),
      pattern: 'GUS',
      ticker: ' ktta ',
      previousClose: 2.65,
      pmOpen: 4.05,
      pmHigh: 4.65,
      floatMillions: 8.2,
      volumeMillions: 3.1,
      locatePerShare: 0.03,
      note: ' Résistance 4,65 ',
      openPrice: 4.2,
      pushOpenPrice: 4.62,
      hodPrice: 4.62,
      lodPrice: 3.41,
      eodPrice: 3.52,
      ssr: true,
      under1Dollar: false,
      entryAfter11am: false,
    };
  }

  function wirePageFixture(content: unknown[]) {
    return { content, number: 0, size: 25, totalElements: content.length, totalPages: 1 };
  }
});
