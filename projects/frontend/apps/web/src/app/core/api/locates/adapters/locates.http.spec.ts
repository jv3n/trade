/**
 * Pins the URL/method contract between [HttpLocatesRepository] and the backend's `/api/locates`
 * routes : the day travels as `YYYY-MM-DD`, the ticker filter only when asked, a locate on a
 * candidate sends no day nor ticker, and the dates come back parsed.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Locate } from '../locates.model';
import { HttpLocatesRepository } from './locates.http';

const SGBX_WIRE = {
  id: 'l-1',
  tradingDate: '2026-09-18',
  ticker: 'SGBX',
  shares: 2000,
  pricePerShare: 0.12,
  cost: 240,
  note: null,
  candidateId: 'c-sgbx',
  createdAt: '2026-09-18T12:40:00Z',
  updatedAt: '2026-09-18T12:40:00Z',
};

describe('HttpLocatesRepository', () => {
  let repo: HttpLocatesRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpLocatesRepository],
    });
    repo = TestBed.inject(HttpLocatesRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("lists a day's locates and parses their dates", () => {
    let locates: Locate[] = [];
    repo.listForDate(new Date(2026, 8, 18)).subscribe((l) => (locates = l));

    const req = http.expectOne('/api/locates?date=2026-09-18');
    expect(req.request.method).toBe('GET');
    req.flush([SGBX_WIRE]);

    expect(locates[0].tradingDate).toEqual(new Date(2026, 8, 18));
    expect(locates[0].cost).toBe(240);
  });

  it('narrows the day to a ticker when asked', () => {
    repo.listForDate(new Date(2026, 8, 18), 'SGBX').subscribe();

    http.expectOne('/api/locates?date=2026-09-18&ticker=SGBX').flush([]);
  });

  it('a locate on a candidate sends neither a day nor a ticker', () => {
    repo
      .create({
        shares: 1000,
        pricePerShare: 0.15,
        candidateId: 'c-sgbx',
        tradingDate: null,
        ticker: null,
        note: '  ',
      })
      .subscribe();

    const req = http.expectOne('/api/locates');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      shares: 1000,
      pricePerShare: 0.15,
      candidateId: 'c-sgbx',
      tradingDate: null,
      ticker: null,
      note: null,
    });
    req.flush(SGBX_WIRE);
  });

  it('deletes by id', () => {
    repo.delete('l-1').subscribe();

    expect(http.expectOne('/api/locates/l-1').request.method).toBe('DELETE');
  });
});
