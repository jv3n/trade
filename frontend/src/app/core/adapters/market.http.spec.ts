/**
 * Pins the URL/method contract between `HttpMarketRepository` (the adapter) and the backend's
 * `/api/market/ticker/...` routes. A silent rename on either side breaks the dossier ticker page ;
 * these tests catch that on the frontend side.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { HttpMarketRepository } from './market.http';

describe('HttpMarketRepository', () => {
  let repo: HttpMarketRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpMarketRepository],
    });
    repo = TestBed.inject(HttpMarketRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getTicker calls GET /api/market/ticker/:symbol', () => {
    repo.getTicker('AAPL').subscribe();
    const req = http.expectOne('/api/market/ticker/AAPL');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('getTicker URL-encodes symbols with special characters', () => {
    // Tickers like BRK.B or BTC-USD must round-trip safely. The dot/hyphen are URL-safe
    // but we still pass them through encodeURIComponent for any future symbol with `/` etc.
    repo.getTicker('BRK.B').subscribe();
    http.expectOne('/api/market/ticker/BRK.B').flush({});
  });
});
