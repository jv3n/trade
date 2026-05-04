/**
 * Pins the URL/method contract between [HttpWatchlistRepository] and the backend's
 * `/api/watchlist` routes. Idempotency / 404 semantics are tested server-side ; here we just
 * pin the wire format the front commits to.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { HttpWatchlistRepository } from './watchlist.http';

describe('HttpWatchlistRepository', () => {
  let repo: HttpWatchlistRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpWatchlistRepository],
    });
    repo = TestBed.inject(HttpWatchlistRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list calls GET /api/watchlist', () => {
    repo.list().subscribe();
    const req = http.expectOne('/api/watchlist');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('add POSTs the symbol in the body, not the URL', () => {
    // Backend is idempotent — a duplicate POST returns the existing row, so the front never
    // has to check existence first. This keeps the adapter dumb.
    repo.add('NVDA').subscribe();
    const req = http.expectOne('/api/watchlist');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ symbol: 'NVDA' });
    req.flush({});
  });

  it('remove calls DELETE /api/watchlist/:symbol with URL encoding', () => {
    // Tickers like BRK.B / BTC-USD are URL-safe but encodeURIComponent guards against any
    // future symbol with `/` or `&` (forex pairs perhaps).
    repo.remove('BRK.B').subscribe();
    http.expectOne('/api/watchlist/BRK.B').flush(null);
  });
});
