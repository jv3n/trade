/**
 * Pins the URL/method contract between [HttpTradingDayRepository] and the backend's
 * `/api/trading-days/{date}` routes : the day travels as `YYYY-MM-DD` in the path, the marks come
 * back as ISO instants or null.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TradingDay } from '../trading-day.model';
import { HttpTradingDayRepository } from './trading-day.http';

describe('HttpTradingDayRepository', () => {
  let repo: HttpTradingDayRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpTradingDayRepository],
    });
    repo = TestBed.inject(HttpTradingDayRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('get reads the day by its date and parses the marks', () => {
    let day: TradingDay | undefined;
    repo.get(new Date(2026, 8, 25)).subscribe((d) => (day = d));

    const req = http.expectOne('/api/trading-days/2026-09-25');
    expect(req.request.method).toBe('GET');
    req.flush({
      tradingDate: '2026-09-25',
      noCandidateAt: '2026-09-25T12:40:00Z',
      noTradeAt: null,
    });

    expect(day?.noCandidateAt?.toISOString()).toBe('2026-09-25T12:40:00.000Z');
    expect(day?.noTradeAt).toBeNull();
  });

  it('put writes both marks at once', () => {
    repo.put(new Date(2026, 8, 25), { noCandidate: true, noTrade: false }).subscribe();

    const req = http.expectOne('/api/trading-days/2026-09-25');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ noCandidate: true, noTrade: false });
    req.flush({
      tradingDate: '2026-09-25',
      noCandidateAt: '2026-09-25T12:40:00Z',
      noTradeAt: null,
    });
  });
});
