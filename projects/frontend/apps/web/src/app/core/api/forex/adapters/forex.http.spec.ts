import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ForexRepository } from '../forex.repository';
import { HttpForexRepository } from './forex.http';

/**
 * Adapter contract test for [HttpForexRepository] — pins the HTTP surface (`/api/forex/rate` + the
 * `base`/`quote` query params, defaulting to USD→CAD) and the wire ↔ domain mapping (ISO `asOf`
 * parsed to a `Date`). The account page only ever sees the domain `ForexRate` this adapter produces.
 */
describe('HttpForexRepository', () => {
  let repo: ForexRepository;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ForexRepository, useClass: HttpForexRepository },
      ],
    });
    repo = TestBed.inject(ForexRepository);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('defaults to USD→CAD and maps the rate + parsed asOf date', () => {
    let result: { rate: number; quote: string; asOf: Date } | null = null;
    repo.latestRate().subscribe((r) => (result = r));

    const req = httpMock.expectOne((r) => r.url === '/api/forex/rate');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('base')).toBe('USD');
    expect(req.request.params.get('quote')).toBe('CAD');
    req.flush({ base: 'USD', quote: 'CAD', rate: 1.3712, asOf: '2026-06-15' });

    expect(result!.rate).toBe(1.3712);
    expect(result!.quote).toBe('CAD');
    expect(result!.asOf instanceof Date).toBe(true);
    expect(result!.asOf.getFullYear()).toBe(2026);
  });

  it('forwards an explicit currency pair', () => {
    repo.latestRate('USD', 'EUR').subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/forex/rate');
    expect(req.request.params.get('quote')).toBe('EUR');
    req.flush({ base: 'USD', quote: 'EUR', rate: 0.92, asOf: '2026-06-15' });
  });
});
