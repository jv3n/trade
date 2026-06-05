import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { PortfolioRepository } from '../../core/api/portfolio/portfolio.repository';
import { Import } from './import';

const mockPortfolioRepository = {
  previewCsvImport: () => of({ accounts: [], totalItems: 0, skippedRows: 0, warnings: [] }),
  confirmCsvImport: () =>
    of({ portfoliosCreated: 0, portfoliosUpdated: 0, totalImported: 0, skipped: 0 }),
};

describe('Import', () => {
  let component: Import;
  let fixture: ComponentFixture<Import>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Import],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService({ lang: 'en' }),
        { provide: PortfolioRepository, useValue: mockPortfolioRepository },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Import);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('navigates to /suivi on imported', async () => {
    const spy = vi.spyOn(router, 'navigate');
    component.onImported();
    expect(spy).toHaveBeenCalledWith(['/suivi']);
  });
});
