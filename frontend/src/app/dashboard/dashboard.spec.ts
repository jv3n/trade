import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Dashboard } from './dashboard';
import { PortfolioService, Asset } from '../core/portfolio.service';
import { AnalysisService } from '../core/analysis.service';

const mockPortfolioService = {
  getAll: () => of([]),
  getAssets: () => of([]),
};

const mockAnalysisService = {
  startAnalysis: () => of({}),
};

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        { provide: PortfolioService, useValue: mockPortfolioService },
        { provide: AnalysisService, useValue: mockAnalysisService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ---- actionClass ----

  it('actionClass returns action-buy for BUY', () => {
    expect(component.actionClass('BUY')).toBe('action-buy');
  });

  it('actionClass returns action-sell for SELL', () => {
    expect(component.actionClass('SELL')).toBe('action-sell');
  });

  it('actionClass returns action-hold for HOLD', () => {
    expect(component.actionClass('HOLD')).toBe('action-hold');
  });

  it('actionClass returns action-reduce for REDUCE', () => {
    expect(component.actionClass('REDUCE')).toBe('action-reduce');
  });

  it('actionClass returns empty string for unknown', () => {
    expect(component.actionClass('UNKNOWN')).toBe('');
  });

  // ---- actionAmounts ----

  it('actionAmounts returns null when targetWeight is null', () => {
    expect(component.actionAmounts('AAPL', null)).toBeNull();
  });

  it('actionAmounts returns null when portfolio is empty (total = 0)', () => {
    component.assets.set([]);
    expect(component.actionAmounts('AAPL', 10)).toBeNull();
  });

  it('actionAmounts computes values correctly', () => {
    const assets: Asset[] = [
      { id: '1', portfolioId: 'p1', ticker: 'AAPL', name: 'Apple', quantity: 10, avgBuyPrice: 100, assetType: 'STOCK', totalValue: 1000, createdAt: '' },
      { id: '2', portfolioId: 'p1', ticker: 'GOOG', name: 'Google', quantity: 5, avgBuyPrice: 200, assetType: 'STOCK', totalValue: 1000, createdAt: '' },
    ];
    component.assets.set(assets);
    // total = 2000, AAPL = 1000 (50%), target = 60%
    const result = component.actionAmounts('AAPL', 60);
    expect(result).not.toBeNull();
    expect(result!.currentValue).toBe(1000);
    expect(result!.currentWeight).toBeCloseTo(50);
    expect(result!.targetAmount).toBeCloseTo(1200);
    expect(result!.delta).toBeCloseTo(200);
  });

  it('actionAmounts uses 0 for asset not found in portfolio', () => {
    const assets: Asset[] = [
      { id: '1', portfolioId: 'p1', ticker: 'GOOG', name: 'Google', quantity: 5, avgBuyPrice: 200, assetType: 'STOCK', totalValue: 1000, createdAt: '' },
    ];
    component.assets.set(assets);
    const result = component.actionAmounts('AAPL', 20);
    expect(result).not.toBeNull();
    expect(result!.currentValue).toBe(0);
    expect(result!.currentWeight).toBe(0);
    expect(result!.targetAmount).toBeCloseTo(200);
    expect(result!.delta).toBeCloseTo(200);
  });
});
