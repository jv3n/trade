/**
 * Tests on the dashboard page. Two pieces of logic that *don't* simply mirror data from the API
 * are pinned down here — those are the ones a refactor could break silently :
 *
 * - **`actionClass(action)`** — translates legacy Phase 0 action enums (`BUY` / `SELL` / `HOLD` /
 *   `REDUCE`) to the corresponding CSS class. Cosmetic but UI-load-bearing : a regression flips
 *   the badge color and traders read green-on-sell as a buy signal at a glance.
 * - **`actionAmounts(ticker, targetWeight)`** — computes the rebalance amount in CAD from the
 *   current portfolio's `bookValueCad`. The math (current weight, target amount, delta) feeds the
 *   "rebalance to" UI hint. Edge cases tested : null target weight, empty portfolio, asset not in
 *   portfolio (must default `currentValue = 0`, not throw).
 *
 * Repos are mocked with simple stubs because we're verifying *the component's logic*, not the
 * HTTP layer (covered separately in `core/adapters/*.http.spec.ts`).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { Dashboard } from './dashboard';
import {
  PortfolioRepository,
  Asset,
  Portfolio,
  OwnedTicker,
} from '../../core/portfolio.repository';
import { AnalysisRepository } from '../../core/analysis.repository';

const mockPortfolioRepository: {
  getAll: () => Observable<Portfolio[]>;
  getAssets: () => Observable<Asset[]>;
  getOwnedTickers: () => Observable<OwnedTicker[]>;
} = {
  getAll: () => of([]),
  getAssets: () => of([]),
  getOwnedTickers: () => of([]),
};

const mockAnalysisRepository = {
  startAnalysis: () => of({}),
};

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        { provide: PortfolioRepository, useValue: mockPortfolioRepository },
        { provide: AnalysisRepository, useValue: mockAnalysisRepository },
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

  // ---- grandTotalCad ----

  it('grandTotalCad sums totalBookValueCad across all portfolios', () => {
    // Pins the contract with the backend's `PortfolioDto.totalBookValueCad`. A rename on either
    // side would zero out the sidebar's "Total agrégé" — surface the regression here.
    const portfolios: Portfolio[] = [
      {
        id: 'p1',
        name: 'CELI',
        description: null,
        createdAt: '',
        updatedAt: '',
        assetCount: 3,
        totalBookValueCad: 5000,
      },
      {
        id: 'p2',
        name: 'REER',
        description: null,
        createdAt: '',
        updatedAt: '',
        assetCount: 4,
        totalBookValueCad: 7500,
      },
    ];
    component.portfolios.set(portfolios);
    expect(component.grandTotalCad()).toBe(12500);
  });

  it('grandTotalCad is 0 when there are no portfolios', () => {
    component.portfolios.set([]);
    expect(component.grandTotalCad()).toBe(0);
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

  // ---- ownedTickers ----

  /**
   * The "Tickers détenus" sidebar shortcut consumes the backend's aggregate endpoint as-is. We
   * pin three things : the signal is hydrated on init, the order from the backend is preserved
   * (back returns alphabetical), and a load failure leaves the sidebar empty rather than blocking
   * the dashboard.
   */
  describe('ownedTickers', () => {
    it('hydrates the signal from getOwnedTickers on init and preserves order', async () => {
      const tickers: OwnedTicker[] = [
        { ticker: 'AAPL', name: 'Apple Inc.', portfolioCount: 2 },
        { ticker: 'MSFT', name: 'Microsoft Corporation', portfolioCount: 1 },
        { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', portfolioCount: 1 },
      ];
      mockPortfolioRepository.getOwnedTickers = () => of(tickers);

      // Re-create the component so init runs against the new mock.
      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      expect(fixture2.componentInstance.ownedTickers()).toEqual(tickers);
    });

    it('falls back to empty list silently on backend failure', async () => {
      const { throwError } = await import('rxjs');
      mockPortfolioRepository.getOwnedTickers = () => throwError(() => new Error('500'));

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      // No error banner from this — the sidebar shortcut is best-effort, not load-bearing.
      expect(fixture2.componentInstance.ownedTickers()).toEqual([]);
      expect(fixture2.componentInstance.error()).toBeNull();
    });
  });
});
