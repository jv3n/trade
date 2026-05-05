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
import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
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
import { MarketRepository, SymbolMatch } from '../../core/market.repository';
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

/**
 * MarketRepository mock — only `searchSymbols` is exercised here ; the rest of the port is unused
 * on the dashboard. Returning `of([])` by default keeps the autocomplete inert in tests that don't
 * explicitly drive it.
 */
const mockMarketRepository: {
  searchSymbols: (q: string, l?: number) => Observable<SymbolMatch[]>;
} = {
  searchSymbols: () => of([]),
};

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        { provide: PortfolioRepository, useValue: mockPortfolioRepository },
        { provide: AnalysisRepository, useValue: mockAnalysisRepository },
        { provide: WatchlistRepository, useValue: mockWatchlistRepository },
        { provide: MarketRepository, useValue: mockMarketRepository },
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

    const match = (symbol: string, name = `${symbol} Inc`, exchange = 'NASDAQ'): SymbolMatch => ({
      symbol,
      name,
      exchange,
    });

    /**
     * Reset the module-level repo mocks before every test in this block — without this, an earlier
     * test that swaps in a `throwError` stays sticky for the next test (the mocks are shared across
     * the `describe`). Hard-to-debug failures when a test asserts on what looks like an unrelated
     * code path. Bring back the inert defaults so each test starts from a known floor.
     */
    beforeEach(() => {
      mockWatchlistRepository.list = () => of([]);
      mockWatchlistRepository.add = () => of({} as WatchlistEntry);
      mockWatchlistRepository.remove = () => of(undefined);
      mockMarketRepository.searchSymbols = () => of([]);
    });

    it('hydrates the watchlist signal from list() on init', async () => {
      const entries = [sample('AAPL'), sample('NVDA')];
      mockWatchlistRepository.list = () => of(entries);

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      expect(fixture2.componentInstance.watchlist()).toEqual(entries);
    });

    it('addToWatchlist appends the picked match and resets the input on success', () => {
      // The autocomplete two-stage flow : the user picks a `SymbolMatch` from the dropdown, then
      // hits Add. We bypass the dropdown here and set `watchlistSelectedMatch` directly to mirror
      // the post-pick state of the component.
      const newEntry = sample('NVDA');
      mockWatchlistRepository.add = () => of(newEntry);
      component.watchlistSelectedMatch.set(match('NVDA'));

      component.addToWatchlist();

      expect(component.watchlist().some((e) => e.symbol === 'NVDA')).toBe(true);
      expect(component.watchlistSelectedMatch()).toBeNull();
      expect(component.watchlistSearchControl.value).toBe('');
      expect(component.watchlistSuggestions()).toEqual([]);
      expect(component.watchlistAdding()).toBe(false);
    });

    it('addToWatchlist deduplicates when the backend returns an existing symbol', () => {
      // Backend's idempotent POST returns the existing row when posting a duplicate. The local
      // list must stay at one entry, not two — otherwise the sidebar would render `AAPL`
      // twice after a re-add. With the autocomplete refactor, "duplicate" means the user picked a
      // suggestion for a symbol they already track ; the gate doesn't prevent that.
      const existing = sample('AAPL');
      component.watchlist.set([existing]);
      mockWatchlistRepository.add = () => of(existing);
      component.watchlistSelectedMatch.set(match('AAPL', 'Apple Inc'));

      component.addToWatchlist();

      expect(component.watchlist().filter((e) => e.symbol === 'AAPL')).toHaveLength(1);
    });

    it('addToWatchlist does nothing when no suggestion is picked', () => {
      // Defends the v2 invariant : the user must pick from the dropdown before adding. The Add
      // button is already disabled in the template, but the public method must guard too — a
      // future test that calls `addToWatchlist()` directly without picking would silently miss the
      // gate without this assertion.
      let addCalled = false;
      mockWatchlistRepository.add = () => {
        addCalled = true;
        return of(sample('AAPL'));
      };
      component.watchlistSelectedMatch.set(null);

      component.addToWatchlist();

      expect(addCalled).toBe(false);
      expect(component.watchlistAdding()).toBe(false);
    });

    it('addToWatchlist surfaces the validation error message on a 400 response', async () => {
      // Mirror of the backend Phase 2 v2 gate : the symbol-search service rejected the symbol →
      // 400. The user sees the localised "not recognised" message and the search text is kept so
      // they can pick a different suggestion without retyping.
      const { throwError } = await import('rxjs');
      mockWatchlistRepository.add = () => throwError(() => ({ status: 400 }));
      component.watchlistSelectedMatch.set(match('XXXXX', 'Some unknown'));
      component.watchlistSearchControl.setValue('XXXXX', { emitEvent: false });

      component.addToWatchlist();

      expect(component.watchlistError()).not.toBeNull();
      expect(component.watchlistAdding()).toBe(false);
      // Search text preserved — the user can correct rather than retype. Same UX as before the
      // refactor, just on the new control.
      expect(component.watchlistSearchControl.value).toBe('XXXXX');
    });

    // ---- autocomplete plumbing ----

    it('populates suggestions from the market provider after a debounced keystroke', async () => {
      // Drives the valueChanges pipeline end-to-end : type "AAP" → debounce 300 ms → search →
      // suggestions populate. We use vitest's fake timers to skip the debounce wait.
      vi.useFakeTimers();
      try {
        const matches = [
          match('AAPL', 'Apple Inc'),
          match('AAP', 'Advance Auto Parts Inc', 'NYSE'),
        ];
        mockMarketRepository.searchSymbols = () => of(matches);

        component.watchlistSearchControl.setValue('AAP');
        vi.advanceTimersByTime(310);
        await Promise.resolve();

        expect(component.watchlistSuggestions()).toEqual(matches);
      } finally {
        vi.useRealTimers();
      }
    });

    it('clears the previous selection when the user retypes', async () => {
      // After picking AAPL, the user starts typing again → the previous selection must be wiped
      // so the Add button doesn't stay enabled with a stale match. Otherwise a "I picked AAPL,
      // typed XYZ over it, hit Add" sequence would add AAPL — confusing.
      vi.useFakeTimers();
      try {
        component.watchlistSelectedMatch.set(match('AAPL'));
        component.watchlistSearchControl.setValue('XYZ');
        vi.advanceTimersByTime(310);
        await Promise.resolve();

        expect(component.watchlistSelectedMatch()).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not wipe the selection when a typed string lingers in the debounce buffer past a pick', async () => {
      // The race the pipeline guards against : user types `AAP`, suggestions appear, user clicks
      // `AAPL` from the dropdown 250 ms later — before the debounce of the typed string has
      // fired. 60 ms after that, the original debounce expires and switchMap fires with
      // `typedValue='AAP'`. Without the guard, switchMap would call `watchlistSelectedMatch.set(null)`
      // and wipe the user's pick. With the guard, switchMap reads the *current* control value
      // (now the `SymbolMatch` object, set by `optionSelected`), short-circuits, and the pick
      // survives. This test reproduces that exact sequence — failing it means the dashboard
      // autocomplete is broken in a way that's hard to repro by hand.
      vi.useFakeTimers();
      try {
        const picked = match('AAPL');
        // (1) User types 'AAP'.
        component.watchlistSearchControl.setValue('AAP');
        // (2) Debounce in flight, not fired yet.
        vi.advanceTimersByTime(250);
        // (3) User picks AAPL — `mat-autocomplete` sets the control value to the SymbolMatch and
        // fires `optionSelected`. We simulate both : flip the control value (this emits a
        // valueChanges, which the `filter` step drops because it's a non-string) and call the
        // select handler the way the template does.
        component.watchlistSearchControl.setValue(picked);
        component.watchlistSelectedMatch.set(picked);
        // (4) Original 'AAP' debounce fires now → switchMap runs.
        vi.advanceTimersByTime(60);
        await Promise.resolve();

        // (5) Selection survives — the lingering switchMap saw a non-string current value and
        // bailed out without clearing.
        expect(component.watchlistSelectedMatch()).toBe(picked);
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps the dropdown empty on a search HTTP failure (no error banner)', async () => {
      // A 503 from the upstream collapses the dropdown to "nothing" rather than blowing up the
      // sidebar. The watchlist add error surface (`watchlistError`) is reserved for add/remove
      // failures, not search failures — search is best-effort.
      const { throwError } = await import('rxjs');
      vi.useFakeTimers();
      try {
        mockMarketRepository.searchSymbols = () => throwError(() => ({ status: 503 }));

        component.watchlistSearchControl.setValue('AAP');
        vi.advanceTimersByTime(310);
        await Promise.resolve();

        expect(component.watchlistSuggestions()).toEqual([]);
        expect(component.watchlistError()).toBeNull();
      } finally {
        vi.useRealTimers();
      }
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
