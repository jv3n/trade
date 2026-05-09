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

  // ---- Symbol search (autocomplete) ----

  describe('searchSymbols', () => {
    it('calls GET /api/market/symbols/search with the query and a default limit of 10', () => {
      // The autocomplete dropdown only shows a handful of suggestions ; default 10 is enough and
      // keeps the payload small. A regression that bumps the default would still work but burn
      // more Twelve Data credits per keystroke.
      repo.searchSymbols('aapl').subscribe();
      const req = http.expectOne(
        (r) =>
          r.url === '/api/market/symbols/search' &&
          r.params.get('q') === 'aapl' &&
          r.params.get('limit') === '10',
      );
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('forwards an explicit limit verbatim', () => {
      // Future-proofing : a settings page that exposes "max suggestions" needs to flow into the
      // request without being clamped on the frontend (the backend does the clamp).
      repo.searchSymbols('a', 25).subscribe();
      http
        .expectOne(
          (r) =>
            r.url === '/api/market/symbols/search' &&
            r.params.get('q') === 'a' &&
            r.params.get('limit') === '25',
        )
        .flush([]);
    });

    it('returns the raw SymbolMatch array as-is', () => {
      // No transformation in the adapter — the backend already returns the shape the front needs.
      // Pinning so a future "enrich with exchange code" refactor keeps the wire shape stable.
      const expected = [
        { symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ' },
        { symbol: 'AAP', name: 'Advance Auto Parts Inc', exchange: 'NYSE' },
      ];
      let received: unknown = null;
      repo.searchSymbols('aap').subscribe((r) => (received = r));
      http.expectOne((r) => r.url === '/api/market/symbols/search').flush(expected);
      expect(received).toEqual(expected);
    });
  });

  // ---- Multi-timeframe chart ----

  describe('getChart', () => {
    it('calls GET .../chart with the timeframe as query param', () => {
      // Defends the contract : timeframe goes through ?query, not in the path. Backend whitelists
      // server-side ; the front-end only ever sends one of TIMEFRAME_CODES.
      repo.getChart('AAPL', '3mo').subscribe();
      const req = http.expectOne(
        (r) => r.url === '/api/market/ticker/AAPL/chart' && r.params.get('timeframe') === '3mo',
      );
      expect(req.request.method).toBe('GET');
      req.flush({});
    });

    it('passes the requested timeframe verbatim — no normalisation', () => {
      // Each `TimeframeCode` maps 1:1 to a backend enum entry. Mangling here would silently break
      // the chart (backend returns 400 on unknown codes — visible to the user).
      const codes: ('1d' | '5d' | '1mo' | '3mo' | '1y' | '5y')[] = [
        '1d',
        '5d',
        '1mo',
        '3mo',
        '1y',
        '5y',
      ];
      for (const code of codes) {
        repo.getChart('AAPL', code).subscribe();
        http
          .expectOne(
            (r) => r.url === '/api/market/ticker/AAPL/chart' && r.params.get('timeframe') === code,
          )
          .flush({});
      }
    });
  });

  // ---- Narrative pipeline ----

  describe('narrative endpoints', () => {
    it('requestNarrative POSTs to /api/market/ticker/:symbol/narrative', () => {
      repo.requestNarrative('AAPL').subscribe();
      const req = http.expectOne('/api/market/ticker/AAPL/narrative');
      expect(req.request.method).toBe('POST');
      // Body is empty — the symbol is in the URL, the backend doesn't need anything else.
      expect(req.request.body).toEqual({});
      req.flush({});
    });

    it('getLatestNarrative calls GET .../narrative/latest', () => {
      repo.getLatestNarrative('AAPL').subscribe();
      const req = http.expectOne('/api/market/ticker/AAPL/narrative/latest');
      expect(req.request.method).toBe('GET');
      req.flush({});
    });

    it('getNarrativePromptPreview calls GET .../narrative/preview', () => {
      // Read-only preview, no LLM call. Backs the /settings/prompt-preview page.
      repo.getNarrativePromptPreview('AAPL').subscribe();
      const req = http.expectOne('/api/market/ticker/AAPL/narrative/preview');
      expect(req.request.method).toBe('GET');
      req.flush({});
    });

    it('getLatestNarrative maps 404 to null instead of throwing', () => {
      // First visit on a symbol = no snapshot yet. The page must branch on `null`, not
      // catch a scary HTTP error.
      let received: unknown = 'untouched';
      repo.getLatestNarrative('NEWSYM').subscribe({
        next: (v) => (received = v),
        error: () => (received = 'error'),
      });
      http
        .expectOne('/api/market/ticker/NEWSYM/narrative/latest')
        .flush({}, { status: 404, statusText: 'Not Found' });

      expect(received).toBeNull();
    });

    it('getLatestNarrative surfaces non-404 errors normally', () => {
      let receivedError = false;
      repo.getLatestNarrative('AAPL').subscribe({
        error: () => (receivedError = true),
      });
      http
        .expectOne('/api/market/ticker/AAPL/narrative/latest')
        .flush({}, { status: 500, statusText: 'Server Error' });

      expect(receivedError).toBe(true);
    });

    // Live narrative job updates moved to Server-Sent Events — see `JobStreamService` and its
    // spec for the new transport's lifecycle pin (terminal completion, premature close, teardown).
    // The legacy `pollNarrativeJob` was dropped from `MarketRepository` in PR2 of the SSE swap.
  });
});
