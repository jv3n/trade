/**
 * Pins the URL/method contract between [HttpConfigRepository] and the backend's `/api/config`
 * routes. Validation rules and 400/404 semantics are tested server-side ; here we just pin the
 * wire format.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
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
    repo.set('app.allowed.emails', 'alice@example.com').subscribe();
    const req = http.expectOne('/api/config/app.allowed.emails');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ value: 'alice@example.com' });
    req.flush({});
  });

  it('reset calls DELETE /api/config/:key', () => {
    repo.reset('app.allowed.emails').subscribe();
    const req = http.expectOne('/api/config/app.allowed.emails');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
