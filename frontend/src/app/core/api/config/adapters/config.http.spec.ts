/**
 * Pins the URL/method contract between [HttpConfigRepository] and the backend's `/api/config`
 * routes. Validation rules and 400/404 semantics are tested server-side ; here we just pin the
 * wire format.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { HttpConfigRepository } from './config.http';

describe('HttpConfigRepository', () => {
  let repo: HttpConfigRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpConfigRepository],
    });
    repo = TestBed.inject(HttpConfigRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list calls GET /api/config', () => {
    repo.list().subscribe();
    const req = http.expectOne('/api/config');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('set PUTs the value in a wrapper body', () => {
    // Body is `{ value }` rather than the raw string — keeps the contract symmetrical with the
    // future "set + metadata" use cases (description, source, …) without breaking compatibility.
    repo.set('market.twelvedata.api-key', 'abc-123').subscribe();
    const req = http.expectOne('/api/config/market.twelvedata.api-key');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ value: 'abc-123' });
    req.flush({});
  });

  it('reset calls DELETE /api/config/:key', () => {
    repo.reset('market.cache.ttl-minutes').subscribe();
    const req = http.expectOne('/api/config/market.cache.ttl-minutes');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('testTwelveData POSTs the candidate value to /test/twelvedata', () => {
    // The candidate value is sent unsaved — the user can validate the key before committing it.
    repo.testTwelveData('candidate').subscribe();
    const req = http.expectOne('/api/config/test/twelvedata');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ value: 'candidate' });
    req.flush({ ok: true, message: 'OK' });
  });

  it('testFinnhub POSTs the candidate value to /test/finnhub', () => {
    repo.testFinnhub('candidate').subscribe();
    const req = http.expectOne('/api/config/test/finnhub');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ value: 'candidate' });
    req.flush({ ok: false, message: 'Invalid key' });
  });

  it('testAnthropic POSTs the candidate value to /test/anthropic', () => {
    // Mirrors the Twelve Data / Finnhub probes — the candidate Anthropic key is round-tripped
    // unsaved so the user can validate before committing the rotation.
    repo.testAnthropic('sk-ant-candidate').subscribe();
    const req = http.expectOne('/api/config/test/anthropic');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ value: 'sk-ant-candidate' });
    req.flush({ ok: true, message: 'OK — Claude (claude-opus-4-6) replied in 1.4s' });
  });

  it('testLlm POSTs the candidate provider plus model to /test/llm', () => {
    // The LLM probe takes a (provider, model) tuple instead of a single value — the user can
    // validate a candidate model name without first saving it as the active config.
    repo.testLlm('ollama', 'qwen2.5:7b').subscribe();
    const req = http.expectOne('/api/config/test/llm');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ provider: 'ollama', model: 'qwen2.5:7b' });
    req.flush({ ok: true, message: 'OK — Ollama (qwen2.5:7b) replied in 1.4s' });
  });
});
