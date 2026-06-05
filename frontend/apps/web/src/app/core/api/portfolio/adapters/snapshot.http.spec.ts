/**
 * Pins the URL/method contract between `HttpSnapshotRepository` (the adapter) and the backend's
 * `/api/snapshots/...` routes — the timeline data feeding the Suivi page.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpSnapshotRepository } from './snapshot.http';

describe('HttpSnapshotRepository', () => {
  let repo: HttpSnapshotRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpSnapshotRepository],
    });
    repo = TestBed.inject(HttpSnapshotRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAll calls GET /api/snapshots', () => {
    repo.getAll().subscribe();
    const req = http.expectOne('/api/snapshots');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getPositions calls GET /api/snapshots/:id/positions', () => {
    repo.getPositions('snap-1').subscribe();
    const req = http.expectOne('/api/snapshots/snap-1/positions');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
