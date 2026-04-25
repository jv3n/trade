import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { SnapshotService } from './snapshot.service';

describe('SnapshotService', () => {
  let service: SnapshotService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SnapshotService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAll calls GET /api/snapshots', () => {
    service.getAll().subscribe();
    const req = http.expectOne('/api/snapshots');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getPositions calls GET /api/snapshots/:id/positions', () => {
    service.getPositions('snap-1').subscribe();
    const req = http.expectOne('/api/snapshots/snap-1/positions');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
