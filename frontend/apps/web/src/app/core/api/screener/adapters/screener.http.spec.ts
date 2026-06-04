/**
 * Pins the URL contract between [HttpScreenerRepository] and the backend post Phase 6 ticket (9) :
 * - `POST /api/screener/refresh` with no body — the active provider is resolved server-side, the
 *   frontend doesn't pass it. The response carries the envelope (date, provider, fetchedAt,
 *   movers).
 * - `GET /api/screener/movers` with optional `?date=YYYY-MM-DD`. The dynamic filter is no longer
 *   sent — the client applies it locally on the persisted snapshot.
 *
 * Empty envelope (200 OK with `fetchedAt === null`) is part of the contract — the page reads it
 * as the "press Rechercher to amorcer" empty state.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ScreenerSnapshotResponse } from '../screener.repository';
import { HttpScreenerRepository } from './screener.http';

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

  it('POSTs an empty body to /api/screener/refresh and returns the parsed envelope', () => {
    let received: ScreenerSnapshotResponse | null = null;
    repo.refresh().subscribe((r) => (received = r));
    const req = http.expectOne('/api/screener/refresh');
    expect(req.request.method).toBe('POST');
    // The backend resolves the active provider — frontend mustn't smuggle one in.
    expect(req.request.body).toBeNull();
    req.flush(sampleEnvelope());
    expect(received).toEqual(sampleEnvelope());
  });

  it('sends GET /api/screener/movers with no date param when called without arguments', () => {
    repo.loadSnapshot().subscribe();
    const req = http.expectOne((r) => r.url === '/api/screener/movers');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('date')).toBe(false);
    req.flush(sampleEnvelope());
  });

  it('serialises the explicit date as ?date=YYYY-MM-DD', () => {
    repo.loadSnapshot('2026-05-27').subscribe();
    const req = http.expectOne((r) => r.url === '/api/screener/movers');
    expect(req.request.params.get('date')).toBe('2026-05-27');
    req.flush(sampleEnvelope());
  });

  it('parses the empty-envelope shape (no snapshot persisted yet)', () => {
    let received: ScreenerSnapshotResponse | null = null;
    repo.loadSnapshot().subscribe((r) => (received = r));
    const req = http.expectOne((r) => r.url === '/api/screener/movers');
    req.flush({ date: null, provider: 'fmp', fetchedAt: null, movers: [] });
    expect(received).toEqual({ date: null, provider: 'fmp', fetchedAt: null, movers: [] });
  });

  function sampleEnvelope(): ScreenerSnapshotResponse {
    return {
      date: '2026-05-29',
      provider: 'fmp',
      fetchedAt: '2026-05-29T14:32:00Z',
      movers: [
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
      ],
    };
  }
});
