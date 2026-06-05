/**
 * Pins the URL/method contract between [HttpNarrativeBiasRepository] and the backend's
 * `/api/narrative/observability/bias` endpoint (Phase 3 #3). A silent rename on either side
 * empties the bias dashboard ; this test catches the frontend half.
 *
 * What we pin :
 *
 * - **Base URL** `/api/narrative/observability/bias` — sibling of the timeline endpoint, sharing
 *   the same controller. A future routing reshuffle that moved this would break the page silently.
 * - **Filter wire-up** : `from / to / promptId` round-trip as query params, mirroring the
 *   timeline's contract. Same trap as the timeline : the param *name* `promptId` (not
 *   `promptTemplateId`) is the wire contract — no compile-time check links it to the Kotlin name.
 * - **Empty filter** : calling `findBias()` without a filter sends no query params at all.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpNarrativeBiasRepository } from './narrative-bias.http';

describe('HttpNarrativeBiasRepository', () => {
  let repo: HttpNarrativeBiasRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpNarrativeBiasRepository],
    });
    repo = TestBed.inject(HttpNarrativeBiasRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs /api/narrative/observability/bias with no params when no filter is provided', () => {
    repo.findBias().subscribe();

    const req = http.expectOne('/api/narrative/observability/bias');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush({});
  });

  it('forwards from / to / promptId as query params under the wire-contract names', () => {
    repo
      .findBias({
        from: '2026-04-01T00:00:00Z',
        to: '2026-05-01T00:00:00Z',
        promptId: 'aaa-bbb-ccc',
      })
      .subscribe();

    const req = http.expectOne(
      (r) =>
        r.url === '/api/narrative/observability/bias' &&
        r.params.get('from') === '2026-04-01T00:00:00Z' &&
        r.params.get('to') === '2026-05-01T00:00:00Z' &&
        // Wire contract : `promptId`, NOT `promptTemplateId` (the Kotlin field name).
        r.params.get('promptId') === 'aaa-bbb-ccc',
    );
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('omits empty-string filter fields from the query string', () => {
    // Pin the per-field guard in the adapter — a regression that called `params.set` regardless
    // would forward `?from=&to=` and the backend would parse them as empty strings and reject.
    repo.findBias({ from: '', to: '', promptId: '' }).subscribe();

    const req = http.expectOne('/api/narrative/observability/bias');
    expect(req.request.params.keys().length).toBe(0);
    req.flush({});
  });
});
