/**
 * Pins the URL/method contract between [HttpNarrativeObservabilityRepository] and the backend's
 * `/api/narrative/observability/:symbol` route (Phase 3 #1). A silent rename on either side
 * empties the observability timeline ; the test catches the frontend half.
 *
 * What we pin :
 *
 * - **Base path** `/api/narrative/observability/:symbol` — different from the dossier ticker
 *   namespace because the page lives at top-level (`/observability/:symbol`), not inside
 *   `/settings`. A future routing reshuffle that moved this under `/api/market/...` would break
 *   the page binding silently.
 * - **Symbol encoding** : tickers with a dot (`BRK.B`) or a dash (`BTC-USD`) round-trip via
 *   `encodeURIComponent` — pinned here so the backend's `@PathVariable symbol` always receives
 *   the exact string the user pasted.
 * - **Filter wire-up** : `from / to / promptId` land as query params. The param *name* `promptId`
 *   (not `promptTemplateId`) is the contract — pinned because the internal Kotlin name on the
 *   service is `promptTemplateId`, and the controller bridges them via `@RequestParam(name = "promptId")`.
 *   A rename here breaks the backend silently (no compile-time check links the two).
 * - **Empty filter** : calling `findFor(symbol)` without a filter sends no query params at all.
 *   Pinned because Angular's `HttpParams` API silently drops `undefined`, but an `else` branch
 *   could regress to forwarding empty strings — checked here.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { HttpNarrativeObservabilityRepository } from './narrative-observability.http';

describe('HttpNarrativeObservabilityRepository', () => {
  let repo: HttpNarrativeObservabilityRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        HttpNarrativeObservabilityRepository,
      ],
    });
    repo = TestBed.inject(HttpNarrativeObservabilityRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('findFor without filter calls GET /api/narrative/observability/:symbol with no query params', () => {
    repo.findFor('AAPL').subscribe();
    const req = http.expectOne(
      (r) => r.url === '/api/narrative/observability/AAPL' && r.params.keys().length === 0,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ symbol: 'AAPL', observations: [] });
  });

  it('forwards from / to / promptId as query params when provided', () => {
    // Pin the *param names* exactly as the backend controller declares them. `promptId` (not
    // `promptTemplateId`) is the wire name — the controller bridges via `@RequestParam(name = "promptId")`.
    repo
      .findFor('NVDA', {
        from: '2026-04-01T00:00:00Z',
        to: '2026-05-01T00:00:00Z',
        promptId: '12345678-1234-1234-1234-123456789012',
      })
      .subscribe();
    const req = http.expectOne(
      (r) =>
        r.url === '/api/narrative/observability/NVDA' &&
        r.params.get('from') === '2026-04-01T00:00:00Z' &&
        r.params.get('to') === '2026-05-01T00:00:00Z' &&
        r.params.get('promptId') === '12345678-1234-1234-1234-123456789012',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ symbol: 'NVDA', observations: [] });
  });

  it('omits filter fields that are not provided rather than sending empty strings', () => {
    // Partial filter — only `promptId` is set. The other two must NOT appear as `from=` / `to=`
    // in the query string ; the backend reads them as empty strings, which would fail the
    // `Instant` parser and 400 the whole request.
    repo.findFor('AAPL', { promptId: 'aaaa-bbbb' }).subscribe();
    const req = http.expectOne(
      (r) =>
        r.url === '/api/narrative/observability/AAPL' &&
        r.params.has('promptId') &&
        !r.params.has('from') &&
        !r.params.has('to'),
    );
    req.flush({ symbol: 'AAPL', observations: [] });
  });

  it('URL-encodes symbols with special characters', () => {
    // BRK.B and BTC-USD both reach the backend verbatim. The dot survives `encodeURIComponent`
    // (allowed in URI segments) but the dash too — we just pin that nothing breaks on the way.
    repo.findFor('BRK.B').subscribe();
    http
      .expectOne((r) => r.url === '/api/narrative/observability/BRK.B')
      .flush({
        symbol: 'BRK.B',
        observations: [],
      });
  });
});
