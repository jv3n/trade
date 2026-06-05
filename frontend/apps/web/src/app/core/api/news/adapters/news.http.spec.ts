/**
 * Pins the URL/method contract between [HttpNewsRepository] and the backend's
 * `/api/market/ticker/:symbol/news` route. A silent rename on either side breaks the dossier news
 * section ; this test catches it on the frontend side.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpNewsRepository } from './news.http';

describe('HttpNewsRepository', () => {
  let repo: HttpNewsRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpNewsRepository],
    });
    repo = TestBed.inject(HttpNewsRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getForSymbol calls GET /api/market/ticker/:symbol/news with limit param', () => {
    repo.getForSymbol('AAPL', 5).subscribe();
    const req = http.expectOne(
      (r) => r.url === '/api/market/ticker/AAPL/news' && r.params.get('limit') === '5',
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('defaults limit to 10 when omitted', () => {
    // Matches the backend default — keeps the front and the back in sync without a "magic
    // number" duplicated in two places.
    repo.getForSymbol('AAPL').subscribe();
    const req = http.expectOne(
      (r) => r.url === '/api/market/ticker/AAPL/news' && r.params.get('limit') === '10',
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('URL-encodes symbols with special characters', () => {
    // Tickers like BRK.B or BTC-USD must round-trip safely.
    repo.getForSymbol('BRK.B').subscribe();
    http.expectOne((r) => r.url === '/api/market/ticker/BRK.B/news').flush([]);
  });
});
