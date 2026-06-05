/**
 * Tests on the dashboard page. Pin the non-trivial UI logic — the parts a refactor could break
 * silently — rather than every signal-to-template pass-through.
 *
 * - **`grandTotalCad`** computed — sums `totalBookValueCad` across portfolios for the sidebar
 *   "Total agrégé". A rename on either side would zero out the value silently.
 * - **`ownedTickers` hydration** — best-effort sidebar shortcut that must NOT block the dashboard
 *   on backend failure (silent fallback to empty list, no error banner).
 * - **Watchlist add/remove flow** — idempotent add, optimistic remove with rollback on server
 *   failure, validation error message on 400, autocomplete debounce + race-condition guard.
 *
 * Repos are mocked with simple stubs because we're verifying *the component's logic*, not the
 * HTTP layer (covered separately in `core/adapters/*.http.spec.ts`).
 */
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { vi } from 'vitest';
import {
  MarketRepository,
  SymbolMatch,
  TickerSnapshot,
} from '../../core/api/market/market.repository';
import {
  Asset,
  OwnedTicker,
  Portfolio,
  PortfolioRepository,
} from '../../core/api/portfolio/portfolio.repository';
import { WatchlistEntry, WatchlistRepository } from '../../core/api/watchlist/watchlist.repository';
import { Dashboard } from './dashboard';

const mockPortfolioRepository: {
  getAll: () => Observable<Portfolio[]>;
  getAssets: () => Observable<Asset[]>;
  getOwnedTickers: () => Observable<OwnedTicker[]>;
} = {
  getAll: () => of([]),
  getAssets: () => of([]),
  getOwnedTickers: () => of([]),
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
 * Builds a minimal `TickerSnapshot` for `getTicker` mocks — only `quote.instrumentType` is read by
 * the watchlist chip lookup, the rest is filler.
 */
const buildSnapshot = (
  symbol: string,
  instrumentType: 'STOCK' | 'ETF' | 'INDEX' | 'OTHER' | null = 'STOCK',
): TickerSnapshot => ({
  quote: {
    symbol,
    name: `${symbol} Inc`,
    currency: 'USD',
    exchange: 'NASDAQ',
    price: 100,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    asOf: '2026-05-07T00:00:00Z',
    instrumentType,
  },
  indicators: null,
  bars: [],
});

/**
 * MarketRepository mock — `searchSymbols` powers the autocomplete, `getTicker` powers the lazy
 * instrument-type lookup for the watchlist chips. Both default to inert returns so tests that
 * don't drive them aren't surprised.
 */
const mockMarketRepository: {
  searchSymbols: (q: string, l?: number) => Observable<SymbolMatch[]>;
  getTicker: (symbol: string) => Observable<TickerSnapshot>;
} = {
  searchSymbols: () => of([]),
  getTicker: (symbol: string) => of(buildSnapshot(symbol)),
};

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        { provide: PortfolioRepository, useValue: mockPortfolioRepository },
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
        { ticker: 'AAPL', name: 'Apple Inc.', assetType: 'STOCK', portfolioCount: 2 },
        { ticker: 'MSFT', name: 'Microsoft Corporation', assetType: 'STOCK', portfolioCount: 1 },
        { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', assetType: 'ETF', portfolioCount: 1 },
      ];
      mockPortfolioRepository.getOwnedTickers = () => of(tickers);

      // Re-create the component so init runs against the new mock.
      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      expect(fixture2.componentInstance.ownedTickers()).toEqual(tickers);
    });

    it('renders the instrument-type chip with the correct variant for each asset type', async () => {
      // Pin the chip rollout for the "Tickers détenus" sidebar : a stock gets `instrument-STOCK`,
      // an ETF gets `instrument-ETF`, a crypto gets `instrument-CRYPTO`. The class binding feeds
      // the SCSS variant colors — a regression in the binding would silently flip a CRYPTO chip
      // to look like a STOCK without changing the JSON output.
      const tickers: OwnedTicker[] = [
        { ticker: 'AAPL', name: 'Apple Inc.', assetType: 'STOCK', portfolioCount: 1 },
        { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', assetType: 'ETF', portfolioCount: 1 },
        { ticker: 'BTC', name: 'Bitcoin', assetType: 'CRYPTO', portfolioCount: 1 },
      ];
      mockPortfolioRepository.getOwnedTickers = () => of(tickers);

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      const chips = fixture2.nativeElement.querySelectorAll(
        '[data-testid="owned-ticker-instrument-type"]',
      );
      expect(chips.length).toBe(3);
      expect(chips[0].classList.contains('instrument-STOCK')).toBe(true);
      expect(chips[1].classList.contains('instrument-ETF')).toBe(true);
      expect(chips[2].classList.contains('instrument-CRYPTO')).toBe(true);
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
    const sample = (
      symbol: string,
      instrumentType: WatchlistEntry['instrumentType'] = null,
    ): WatchlistEntry => ({
      id: `id-${symbol}`,
      symbol,
      addedAt: '2026-05-03T10:00:00Z',
      instrumentType,
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
      mockMarketRepository.getTicker = (symbol: string) => of(buildSnapshot(symbol));
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

    // ---- Instrument-type chip (V7 2026-05-09 — read straight from the DTO) ----

    /**
     * The watchlist chips are now driven by the `instrumentType` field on the DTO, snapshotted
     * server-side at POST-add time (V7 migration). Replaces the previous lazy-lookup design
     * (`enrichWatchlistInstrumentTypes` firing a `getTicker` per entry on dashboard mount) that
     * burst-banned Twelve Data on cold cache. Three contracts pinned :
     *  - **chip renders from `entry.instrumentType`** — no client-side fetch needed,
     *  - **null entry → no chip** (degrade closed for pre-V7 rows or rows where the server-side
     *    lookup failed at add time),
     *  - **dashboard mount fires zero `getTicker`** for watchlist enrichment — that was the
     *    expensive burst we eliminated.
     */
    it('renders the chip directly from entry.instrumentType', async () => {
      const entries = [sample('AAPL', 'STOCK'), sample('VOO', 'ETF')];
      mockWatchlistRepository.list = () => of(entries);

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      const chips = fixture2.nativeElement.querySelectorAll(
        '[data-testid="watchlist-instrument-type"]',
      );
      // Two entries, both with non-null instrumentType → two chips. The class encodes the type.
      expect(chips.length).toBe(2);
      expect((chips[0] as HTMLElement).className).toContain('instrument-STOCK');
      expect((chips[1] as HTMLElement).className).toContain('instrument-ETF');
    });

    it('renders no chip for an entry with null instrumentType (pre-V7 row or failed lookup)', async () => {
      mockWatchlistRepository.list = () => of([sample('OBSCURE', null)]);

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      const chips = fixture2.nativeElement.querySelectorAll(
        '[data-testid="watchlist-instrument-type"]',
      );
      // Critically NOT a default 'STOCK' chip — null is honored as "no signal" rather than a
      // guess. The user is left with the bare ticker chip until they re-add the symbol.
      expect(chips.length).toBe(0);
    });

    it('does not fire getTicker for watchlist enrichment on dashboard mount', async () => {
      // The expensive burst this fix eliminates : with 5+ watchlist entries + cold Twelve Data
      // cache, the previous design fired 5+ parallel `getTicker(symbol)` calls = 10+ credits
      // = ban on free tier (8/min). The V7 design moves the lookup server-side at POST-add
      // time so the dashboard mount has nothing market-related to do.
      let getTickerCalls = 0;
      mockMarketRepository.getTicker = (symbol: string) => {
        getTickerCalls++;
        return of(buildSnapshot(symbol));
      };
      mockWatchlistRepository.list = () => of([sample('AAPL', 'STOCK'), sample('VOO', 'ETF')]);

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      expect(getTickerCalls).toBe(0);
    });
  });

  /**
   * Sidebar portfolios are reorderable via Angular CDK drag-drop. The user-chosen order is persisted
   * to `localStorage` (`portfolio-order` = JSON `string[]` of IDs) so a reload preserves the layout.
   *
   * What we pin :
   * - **localStorage seed is honoured on init** — the stored order wins over the server order. Two
   *   reasons : (1) the user's preference is the source of truth in the UI ; (2) the API returns
   *   the natural insertion order which has no semantic meaning to the user.
   * - **Unknown IDs in storage don't crash** — a stale entry (portfolio renamed-then-deleted, or
   *   imported on another machine) is just skipped, the rest of the order is honoured.
   * - **New portfolios land at the end** — if the user imports a fresh CSV, the new portfolios are
   *   *not* in localStorage yet ; they should appear at the bottom rather than displacing pinned
   *   ones invisibly.
   * - **`onPortfolioDrop` persists** — a drop mutates the signal AND writes the new ID sequence,
   *   so a reload finds the same layout.
   */
  describe('portfolio reordering', () => {
    const buildPortfolio = (id: string, name: string): Portfolio => ({
      id,
      name,
      description: null,
      createdAt: '',
      updatedAt: '',
      assetCount: 1,
      totalBookValueCad: 1000,
    });

    beforeEach(() => {
      localStorage.removeItem('portfolio-order');
    });

    it('applies the persisted order from localStorage on init', async () => {
      // Server returns [P1, P2, P3] but the user's saved preference is [P3, P1, P2] — the saved
      // order wins so the user's last choice survives a reload.
      localStorage.setItem('portfolio-order', JSON.stringify(['p3', 'p1', 'p2']));
      mockPortfolioRepository.getAll = () =>
        of([
          buildPortfolio('p1', 'CELI'),
          buildPortfolio('p2', 'REER'),
          buildPortfolio('p3', 'Crypto'),
        ]);

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      const ids = fixture2.componentInstance.portfolios().map((p) => p.id);
      expect(ids).toEqual(['p3', 'p1', 'p2']);
    });

    it('skips unknown IDs in localStorage and keeps the rest of the order', async () => {
      // `p-deleted` was on the user's list yesterday but has since been removed from the BDD ;
      // the dashboard mustn't crash and the surviving portfolios should still be reordered.
      localStorage.setItem('portfolio-order', JSON.stringify(['p-deleted', 'p2', 'p1']));
      mockPortfolioRepository.getAll = () =>
        of([buildPortfolio('p1', 'CELI'), buildPortfolio('p2', 'REER')]);

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      const ids = fixture2.componentInstance.portfolios().map((p) => p.id);
      expect(ids).toEqual(['p2', 'p1']);
    });

    it('places newly imported portfolios at the end so they do not displace pinned ones invisibly', async () => {
      // The user pinned [P2, P1]. Tomorrow they import a CSV adding P3 — it should land at the
      // bottom of the sidebar, not somewhere in the middle, so the pinned order stays intact.
      localStorage.setItem('portfolio-order', JSON.stringify(['p2', 'p1']));
      mockPortfolioRepository.getAll = () =>
        of([
          buildPortfolio('p1', 'CELI'),
          buildPortfolio('p2', 'REER'),
          buildPortfolio('p3', 'New'),
        ]);

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      const ids = fixture2.componentInstance.portfolios().map((p) => p.id);
      expect(ids).toEqual(['p2', 'p1', 'p3']);
    });

    it('onPortfolioDrop reorders the signal and persists the new ID sequence', () => {
      component.portfolios.set([
        buildPortfolio('p1', 'CELI'),
        buildPortfolio('p2', 'REER'),
        buildPortfolio('p3', 'Crypto'),
      ]);

      // Drop p3 to position 0 (mirror what CDK fires when the user drags the third item to the
      // top of the list).
      component.onPortfolioDrop({
        previousIndex: 2,
        currentIndex: 0,
      } as unknown as Parameters<typeof component.onPortfolioDrop>[0]);

      const ids = component.portfolios().map((p) => p.id);
      expect(ids).toEqual(['p3', 'p1', 'p2']);
      expect(JSON.parse(localStorage.getItem('portfolio-order') ?? '[]')).toEqual([
        'p3',
        'p1',
        'p2',
      ]);
    });

    it('onPortfolioDrop is a no-op when the index does not change', () => {
      // CDK fires a drop event even on a click-and-release — we don't want to write to localStorage
      // in that case (it's not a user-chosen reorder, just noise from a stray pointer).
      component.portfolios.set([buildPortfolio('p1', 'CELI'), buildPortfolio('p2', 'REER')]);

      component.onPortfolioDrop({
        previousIndex: 1,
        currentIndex: 1,
      } as unknown as Parameters<typeof component.onPortfolioDrop>[0]);

      expect(localStorage.getItem('portfolio-order')).toBeNull();
    });

    it('falls back to server order when localStorage holds a corrupt value', async () => {
      // Defensive — a bad JSON shouldn't break the dashboard. We log nothing and just behave as if
      // no preference was set ; the next manual reorder overwrites the bad value cleanly.
      localStorage.setItem('portfolio-order', 'not-json');
      mockPortfolioRepository.getAll = () =>
        of([buildPortfolio('p1', 'CELI'), buildPortfolio('p2', 'REER')]);

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      const ids = fixture2.componentInstance.portfolios().map((p) => p.id);
      expect(ids).toEqual(['p1', 'p2']);
    });
  });

  /**
   * Sidebar accordions (Portfolios / Tickers détenus / Watchlist) keep their open/closed state
   * across reloads via `localStorage` (key `dashboard-sidebar-open` = JSON object with three
   * booleans). Default is "all open" — a fresh user sees the full dashboard on first visit.
   *
   * What we pin :
   * - **Saved state hydrates the three signals on init** so the user's last layout survives a
   *   reload.
   * - **Per-key fallback** — a partial saved object (e.g. shipped before a new accordion was
   *   added) only resets the missing keys, the user's choices on the existing ones are preserved.
   * - **Corrupt JSON falls back to all-open** rather than crashing.
   * - **A toggle persists** — flipping `portfoliosOpen()` writes the new state synchronously (via
   *   the effect registered in the component constructor), so a reload finds the same layout.
   */
  describe('sidebar accordion persistence', () => {
    beforeEach(() => {
      localStorage.removeItem('dashboard-sidebar-open');
    });

    it('hydrates the open state from localStorage on init', async () => {
      localStorage.setItem(
        'dashboard-sidebar-open',
        JSON.stringify({ portfolios: false, ownedTickers: true, watchlist: false }),
      );

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      expect(fixture2.componentInstance.portfoliosOpen()).toBe(false);
      expect(fixture2.componentInstance.ownedTickersOpen()).toBe(true);
      expect(fixture2.componentInstance.watchlistOpen()).toBe(false);
    });

    it('keeps the user choices for existing keys when a partial object is stored', async () => {
      // Defends a forward-compat path : if a future version adds a 4th accordion, an older saved
      // state with only 3 keys mustn't reset the user's existing choices. Each missing key falls
      // back to its default *individually*, not the whole object.
      localStorage.setItem(
        'dashboard-sidebar-open',
        JSON.stringify({ portfolios: false }), // ownedTickers + watchlist absent
      );

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      expect(fixture2.componentInstance.portfoliosOpen()).toBe(false);
      expect(fixture2.componentInstance.ownedTickersOpen()).toBe(true);
      expect(fixture2.componentInstance.watchlistOpen()).toBe(true);
    });

    it('falls back to all-open when localStorage holds a corrupt value', async () => {
      localStorage.setItem('dashboard-sidebar-open', 'not-json');

      const fixture2 = TestBed.createComponent(Dashboard);
      fixture2.detectChanges();
      await fixture2.whenStable();

      expect(fixture2.componentInstance.portfoliosOpen()).toBe(true);
      expect(fixture2.componentInstance.ownedTickersOpen()).toBe(true);
      expect(fixture2.componentInstance.watchlistOpen()).toBe(true);
    });

    it('persists the new state to localStorage when a section toggles', () => {
      // The outer `beforeEach` clears `dashboard-sidebar-open`, so the component starts from the
      // default all-open state. `toggleSidebar()` is the public mutation API : it flips the
      // signal AND persists synchronously at the call site (no effect, no need to wait for a
      // change-detection tick). Two toggles take us from {true, true, true} to
      // {false, true, false} ; ownedTickers stays untouched at true.
      component.toggleSidebar('portfolios');
      component.toggleSidebar('watchlist');

      const saved = JSON.parse(localStorage.getItem('dashboard-sidebar-open') ?? '{}');
      expect(saved).toEqual({
        portfolios: false,
        ownedTickers: true,
        watchlist: false,
      });
    });
  });
});
