import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScannerRun } from '../scanner.model';
import { HttpScannerRepository } from './scanner.http';

/**
 * Pins the read of ts-scanner's latest run (#765) : the trading day comes back as a local day, the
 * instants as instants, and the 204 before the first run as null — not an error.
 */
describe('HttpScannerRepository', () => {
  let repo: HttpScannerRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpScannerRepository, provideHttpClient(), provideHttpClientTesting()],
    });
    repo = TestBed.inject(HttpScannerRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the latest run, its trading day on the local calendar', () => {
    let run: ScannerRun | null = null;
    repo.latestRun().subscribe((r) => (run = r));

    http.expectOne('/api/scanner/runs/latest').flush({
      tradingDate: '2026-09-18',
      startedAt: '2026-09-21T10:10:00Z',
      finishedAt: '2026-09-21T10:14:00Z',
      tickersScanned: 38,
      gusFound: 2,
      dtFound: 2,
      error: null,
    });

    expect(run).toEqual({
      tradingDate: new Date(2026, 8, 18),
      startedAt: new Date('2026-09-21T10:10:00Z'),
      finishedAt: new Date('2026-09-21T10:14:00Z'),
      tickersScanned: 38,
      gusFound: 2,
      dtFound: 2,
      error: null,
    });
  });

  it('reads « never ran » off the 204 as null', () => {
    let run: ScannerRun | null | undefined;
    repo.latestRun().subscribe((r) => (run = r));

    http
      .expectOne('/api/scanner/runs/latest')
      .flush(null, { status: 204, statusText: 'No Content' });

    expect(run).toBeNull();
  });
});
