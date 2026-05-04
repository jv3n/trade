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
import { WatchlistEntry, WatchlistRepository } from '../../core/watchlist.repository';

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

const mockWatchlistRepository: {
  list: () => Observable<WatchlistEntry[]>;
  add: (symbol: string) => Observable<WatchlistEntry>;
  remove: (symbol: string) => Observable<void>;
} = {
  list: () => of([]),
  add: () => of({} as WatchlistEntry),
  remove: () => of(undefined),
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
        { provide: WatchlistRepository, useValue: mockWatchlistRepository },
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

  // ---- watchlist ----

  /**
   * The watchlist sidebar section has its own little add/remove flow with a few non-obvious
   * behaviours pinned here :
   *
   * - **Add idempotency** : the backend returns the existing entry on duplicate POST, so the
   *   front shouldn't accumulate duplicates in the local list. Tested by re-adding an existing
   *   symbol and asserting the list stays at one entry.
   * - **Optimistic remove** : the entry disappears immediately (no spinner), then we wait for
   *   the server. If the server fails (404, 5xx) we restore the entry — the user must not be
   *   left with a stale UI thinking their click took.
   * - **Silent load failure** : same philosophy as `loadOwnedTickers` — a 500 on init leaves the
   *   section empty, never an error banner. The watchlist is best-effort, not load-bearing.
   */
  describe('watchlist', () => {
    const sample = (symbol: string): WatchlistEntry => ({
      id: `id-${symbol}`,
      symbol,
      addedAt: '2026-05-03T10:00:00Z',
    });

    it('hydrates the watchlist signal from list() on init', async () => {
      const entries = [sample('AAPL'), sample('NVDA')];
      mockWatchlistRepository.list = () => of(entries);

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      expect(fixture2.componentInstance.watchlist()).toEqual(entries);
    });

    it('addToWatchlist appends the result and clears the input on success', () => {
      const newEntry = sample('NVDA');
      mockWatchlistRepository.add = () => of(newEntry);

      component.watchlistInput.set('NVDA');
      component.addToWatchlist();

      expect(component.watchlist().some((e) => e.symbol === 'NVDA')).toBe(true);
      expect(component.watchlistInput()).toBe('');
      expect(component.watchlistAdding()).toBe(false);
    });

    it('addToWatchlist deduplicates when the backend returns an existing symbol', () => {
      // Backend's idempotent POST returns the existing row when posting a duplicate. The local
      // list must stay at one entry, not two — otherwise the sidebar would render `AAPL`
      // twice after a re-add.
      const existing = sample('AAPL');
      component.watchlist.set([existing]);
      mockWatchlistRepository.add = () => of(existing);

      component.watchlistInput.set('AAPL');
      component.addToWatchlist();

      expect(component.watchlist().filter((e) => e.symbol === 'AAPL')).toHaveLength(1);
    });

    it('addToWatchlist surfaces error and stops the loading state on failure', async () => {
      const { throwError } = await import('rxjs');
      mockWatchlistRepository.add = () => throwError(() => ({ status: 400 }));

      component.watchlistInput.set('???');
      component.addToWatchlist();

      expect(component.watchlistError()).not.toBeNull();
      expect(component.watchlistAdding()).toBe(false);
      // Input kept so the user can correct rather than retype.
      expect(component.watchlistInput()).toBe('???');
    });

    it('removeFromWatchlist optimistically drops the entry then keeps it gone on success', () => {
      const a = sample('AAPL');
      const n = sample('NVDA');
      component.watchlist.set([a, n]);
      mockWatchlistRepository.remove = () => of(undefined);

      component.removeFromWatchlist('NVDA');

      expect(component.watchlist().map((e) => e.symbol)).toEqual(['AAPL']);
    });

    it('removeFromWatchlist rolls back when the server fails', async () => {
      const { throwError } = await import('rxjs');
      const a = sample('AAPL');
      const n = sample('NVDA');
      component.watchlist.set([a, n]);
      mockWatchlistRepository.remove = () => throwError(() => ({ status: 500 }));

      component.removeFromWatchlist('NVDA');

      // Restored to the pre-click state and an error surfaced so the user knows the click didn't
      // take. Avoids the trap of "I clicked, it disappeared, must've worked" while server still
      // has the entry.
      expect(component.watchlist()).toEqual([a, n]);
      expect(component.watchlistError()).not.toBeNull();
    });

    it('falls back to empty list silently on watchlist load failure', async () => {
      const { throwError } = await import('rxjs');
      mockWatchlistRepository.list = () => throwError(() => new Error('500'));

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      expect(fixture2.componentInstance.watchlist()).toEqual([]);
      expect(fixture2.componentInstance.error()).toBeNull();
    });
  });
});
