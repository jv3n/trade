/**
 * Pins the URL / query-param contract between [HttpScreenerRepository] and the backend
 * `/api/screener/movers` endpoint. The shape `?gapPctMin=...&volumeRatioMin=...&...` is the only
 * surface the front commits to ; the backend's filter / sort / empty-list semantics are tested
 * server-side.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpScreenerRepository } from './screener.http';
import { DEFAULT_SCREENER_FILTER, ScreenerFilter } from '../screener.repository';

describe('HttpScreenerRepository', () => {
  let repo: HttpScreenerRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpScreenerRepository],
    });
    repo = TestBed.inject(HttpScreenerRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends GET /api/screener/movers with the default thresholds when no override is supplied', () => {
    repo.findMovers(DEFAULT_SCREENER_FILTER).subscribe();
    const req = http.expectOne((r) => r.url === '/api/screener/movers');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('gapPctMin')).toBe('5');
    expect(req.request.params.get('volumeRatioMin')).toBe('3');
    // Null fields must NOT be serialised — the backend's own defaults / open universe take over.
    expect(req.request.params.has('marketCapMin')).toBe(false);
    expect(req.request.params.has('marketCapMax')).toBe(false);
    expect(req.request.params.has('exchange')).toBe(false);
    expect(req.request.params.has('sector')).toBe(false);
    req.flush([]);
  });

  it('serialises every non-null filter field as a query param', () => {
    const filter: ScreenerFilter = {
      gapPctMin: 10,
      volumeRatioMin: 5,
      marketCapMin: 3_000_000_000,
      marketCapMax: 8_000_000_000,
      exchange: 'NASDAQ',
      sector: 'Technology',
    };
    repo.findMovers(filter).subscribe();
    const req = http.expectOne((r) => r.url === '/api/screener/movers');
    expect(req.request.params.get('gapPctMin')).toBe('10');
    expect(req.request.params.get('volumeRatioMin')).toBe('5');
    expect(req.request.params.get('marketCapMin')).toBe('3000000000');
    expect(req.request.params.get('marketCapMax')).toBe('8000000000');
    expect(req.request.params.get('exchange')).toBe('NASDAQ');
    expect(req.request.params.get('sector')).toBe('Technology');
    req.flush([]);
  });

  it('returns the parsed list of TickerMover rows', () => {
    let received: unknown = null;
    repo.findMovers(DEFAULT_SCREENER_FILTER).subscribe((r) => (received = r));
    const req = http.expectOne((r) => r.url === '/api/screener/movers');
    req.flush([
      {
        symbol: 'RDDT',
        name: 'Reddit Inc.',
        price: 78.4,
        previousClose: 67.2,
        gapPct: 16.67,
        volume: 24_500_000,
        volumeAvg30d: 6_000_000,
        volumeRatio: 4.08,
        marketCapUsd: 9_800_000_000,
        exchange: 'NASDAQ',
        sector: 'Communication Services',
      },
    ]);
    expect(received).toEqual([
      {
        symbol: 'RDDT',
        name: 'Reddit Inc.',
        price: 78.4,
        previousClose: 67.2,
        gapPct: 16.67,
        volume: 24_500_000,
        volumeAvg30d: 6_000_000,
        volumeRatio: 4.08,
        marketCapUsd: 9_800_000_000,
        exchange: 'NASDAQ',
        sector: 'Communication Services',
      },
    ]);
  });
});
