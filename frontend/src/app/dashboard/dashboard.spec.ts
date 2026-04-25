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

  it('actionAmounts computes values in CAD using bookValueCad', () => {
    const assets: Asset[] = [
      {
        id: '1',
        portfolioId: 'p1',
        ticker: 'AAPL',
        name: 'Apple',
        quantity: 10,
        avgBuyPrice: 100,
        assetType: 'STOCK',
        currency: 'USD',
        bookValueCad: 1400,
        marketValue: 1000,
        marketPrice: 100,
        unrealizedGain: null,
        gainCurrency: null,
        createdAt: '',
      },
      {
        id: '2',
        portfolioId: 'p1',
        ticker: 'XIU',
        name: 'iShares',
        quantity: 5,
        avgBuyPrice: 200,
        assetType: 'ETF',
        currency: 'CAD',
        bookValueCad: 600,
        marketValue: 1000,
        marketPrice: 200,
        unrealizedGain: null,
        gainCurrency: null,
        createdAt: '',
      },
    ];
    component.assets.set(assets);
    // totalCad = 2000, AAPL bookValueCad = 1400 (70%), target = 50%
    const result = component.actionAmounts('AAPL', 50);
    expect(result).not.toBeNull();
    expect(result!.currentValue).toBe(1400);
    expect(result!.currentWeight).toBeCloseTo(70);
    expect(result!.targetAmount).toBeCloseTo(1000);
    expect(result!.delta).toBeCloseTo(-400);
    expect(result!.currency).toBe('CAD');
  });

  it('actionAmounts uses 0 bookValueCad for asset not in portfolio', () => {
    const assets: Asset[] = [
      {
        id: '1',
        portfolioId: 'p1',
        ticker: 'XIU',
        name: 'iShares',
        quantity: 5,
        avgBuyPrice: 200,
        assetType: 'ETF',
        currency: 'CAD',
        bookValueCad: 1000,
        marketValue: 1000,
        marketPrice: 200,
        unrealizedGain: null,
        gainCurrency: null,
        createdAt: '',
      },
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
