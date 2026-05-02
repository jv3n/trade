import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { HttpPortfolioRepository } from './portfolio.http';

describe('HttpPortfolioRepository', () => {
  let repo: HttpPortfolioRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpPortfolioRepository],
    });
    repo = TestBed.inject(HttpPortfolioRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAll calls GET /api/portfolios', () => {
    repo.getAll().subscribe();
    const req = http.expectOne('/api/portfolios');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getById calls GET /api/portfolios/:id', () => {
    repo.getById('abc').subscribe();
    const req = http.expectOne('/api/portfolios/abc');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('getAssets calls GET /api/portfolios/:id/assets', () => {
    repo.getAssets('p1').subscribe();
    const req = http.expectOne('/api/portfolios/p1/assets');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('previewCsvImport calls POST /api/portfolios/import/csv/preview with FormData', () => {
    const file = new File(['content'], 'test.csv', { type: 'text/csv' });
    repo.previewCsvImport(file).subscribe();
    const req = http.expectOne('/api/portfolios/import/csv/preview');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush({ accounts: [], totalItems: 0, skippedRows: 0, warnings: [] });
  });

  it('confirmCsvImport calls POST /api/portfolios/import/csv with FormData', () => {
    const file = new File(['content'], 'test.csv', { type: 'text/csv' });
    repo.confirmCsvImport(file).subscribe();
    const req = http.expectOne('/api/portfolios/import/csv');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush({ portfoliosCreated: 1, portfoliosUpdated: 0, totalImported: 5, skipped: 0 });
  });
});
