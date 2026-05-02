/**
 * Pins the URL/method contract between `HttpSettingsRepository` (the adapter) and the backend's
 * `/api/ingestion/sources/...` routes. The `/test` endpoint is exercised by the legacy Phase 0
 * "test source" page — kept here because the adapter still ships even though the page is rarely
 * the user's first stop.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { HttpSettingsRepository } from './settings.http';

describe('HttpSettingsRepository', () => {
  let repo: HttpSettingsRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpSettingsRepository],
    });
    repo = TestBed.inject(HttpSettingsRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getSources calls GET /api/ingestion/sources', () => {
    repo.getSources().subscribe();
    const req = http.expectOne('/api/ingestion/sources');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('updateEnabled calls PATCH /api/ingestion/sources/:id with {enabled}', () => {
    repo.updateEnabled('src-1', true).subscribe();
    const req = http.expectOne('/api/ingestion/sources/src-1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ enabled: true });
    req.flush({});
  });

  it('updateEnabled forwards false to the body', () => {
    repo.updateEnabled('src-1', false).subscribe();
    const req = http.expectOne('/api/ingestion/sources/src-1');
    expect(req.request.body).toEqual({ enabled: false });
    req.flush({});
  });

  it('testSource calls GET /api/ingestion/sources/:id/test', () => {
    repo.testSource('src-1').subscribe();
    const req = http.expectOne('/api/ingestion/sources/src-1/test');
    expect(req.request.method).toBe('GET');
    req.flush({ ok: true, error: null, message: null, itemCount: 0, items: [] });
  });
});
