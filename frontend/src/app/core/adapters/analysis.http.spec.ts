/**
 * Tests on `HttpAnalysisRepository` — the HTTP adapter behind the `AnalysisRepository` port.
 * Two responsibilities to pin down :
 *
 * 1. **URL/method contract** — every method maps to the exact endpoint the backend exposes. A
 *    silent rename of the URL on either side is one of the easiest regressions to ship and the
 *    longest to debug ("why does my POST 404 ?"). One assertion per method is enough.
 *
 * 2. **`pollJob` is the load-bearing one** — emits every 5 s, completes on a non-PENDING status,
 *    aborts after `POLL_ABORT_SECONDS` (legacy 400 s window, set to outlast 2 × Ollama timeouts +
 *    margin), surfaces 404 with a friendly message. Uses `vi.useFakeTimers` so the test isn't
 *    actually 5 s slow ; the time-travel reveals what the real user experiences without the wait.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { HttpAnalysisRepository } from './analysis.http';
import { AnalysisJob } from '../analysis.repository';

describe('HttpAnalysisRepository', () => {
  let repo: HttpAnalysisRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpAnalysisRepository],
    });
    repo = TestBed.inject(HttpAnalysisRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('startAnalysis calls POST /api/portfolios/:id/recommendations', () => {
    repo.startAnalysis('p1').subscribe();
    const req = http.expectOne('/api/portfolios/p1/recommendations');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('getRecommendation calls GET /api/portfolios/:p/recommendations/:r', () => {
    repo.getRecommendation('p1', 'r1').subscribe();
    const req = http.expectOne('/api/portfolios/p1/recommendations/r1');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('getRecommendations calls GET /api/portfolios/:id/recommendations', () => {
    repo.getRecommendations('p1').subscribe();
    const req = http.expectOne('/api/portfolios/p1/recommendations');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getAllRecommendations calls GET /api/recommendations', () => {
    repo.getAllRecommendations().subscribe();
    const req = http.expectOne('/api/recommendations');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getPromptPreview calls GET /api/portfolios/:id/recommendations/preview', () => {
    repo.getPromptPreview('p1').subscribe();
    const req = http.expectOne('/api/portfolios/p1/recommendations/preview');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  // ---- pollJob ----
  // Uses interval(5000) under fake timers; takeWhile completes the stream on
  // any non-PENDING status, so we can verify both the URL and the completion.

  describe('pollJob', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('polls GET /api/portfolios/:p/recommendations/jobs/:j every 5s and stops on DONE', () => {
      const emissions: AnalysisJob[] = [];
      let completed = false;
      const sub = repo.pollJob('p1', 'j1').subscribe({
        next: (j) => emissions.push(j),
        complete: () => (completed = true),
      });

      vi.advanceTimersByTime(5000);
      const req = http.expectOne('/api/portfolios/p1/recommendations/jobs/j1');
      expect(req.request.method).toBe('GET');
      req.flush({
        jobId: 'j1',
        status: 'DONE',
        createdAt: new Date().toISOString(),
        recommendationId: 'r1',
        error: null,
      });

      expect(emissions).toHaveLength(1);
      expect(emissions[0].status).toBe('DONE');
      expect(completed).toBe(true);
      sub.unsubscribe();
    });

    it('aborts after POLL_ABORT_SECONDS even if backend keeps replying PENDING', () => {
      let receivedError: Error | null = null;
      const createdAt = new Date(Date.now() - 401_000).toISOString();
      const sub = repo.pollJob('p1', 'j1').subscribe({
        next: () => {},
        error: (err: Error) => (receivedError = err),
      });

      vi.advanceTimersByTime(5000);
      const req = http.expectOne('/api/portfolios/p1/recommendations/jobs/j1');
      req.flush({
        jobId: 'j1',
        status: 'PENDING',
        createdAt,
        recommendationId: null,
        error: null,
      });

      expect(receivedError).not.toBeNull();
      expect(receivedError!.message).toContain('Analyse trop longue');
      sub.unsubscribe();
    });

    it('surfaces 404 with a friendly message', () => {
      let receivedError: Error | null = null;
      const sub = repo.pollJob('p1', 'j1').subscribe({
        next: () => {},
        error: (err: Error) => (receivedError = err),
      });

      vi.advanceTimersByTime(5000);
      const req = http.expectOne('/api/portfolios/p1/recommendations/jobs/j1');
      req.flush({}, { status: 404, statusText: 'Not Found' });

      expect(receivedError).not.toBeNull();
      expect(receivedError!.message).toContain('Job introuvable');
      sub.unsubscribe();
    });
  });
});
