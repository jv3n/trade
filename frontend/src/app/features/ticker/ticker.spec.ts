/**
 * Tests on the dossier ticker page. Two responsibilities verified :
 *
 * 1. **Wires up correctly** — the symbol comes from the route, the page hits
 *    `MarketRepository.getTicker(symbol)` on init, and the snapshot signal reflects the response.
 * 2. **Computes UI thresholds correctly** — RSI / drawdown chips use color-coded zones to give
 *    the user an at-a-glance read on whether to worry. Wrong thresholds = wrong UX cue.
 *
 * The thresholds asserted (RSI ≥ 70 or ≤ 30 → `warning`, drawdown ≤ -20% → `danger`) match the
 * conventions a trader would expect (overbought/oversold zones, deep drawdown). They are
 * hard-coded in the component ; the tests pin them down so a refactor doesn't accidentally drift
 * the colors.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, Subject, throwError } from 'rxjs';
import { TickerPage } from './ticker';
import {
  ChartResponse,
  MarketRepository,
  OhlcBar,
  SectorBenchmark,
  SymbolMatch,
  TickerNarrativeJob,
  TickerNarrativeSnapshot,
  TickerSnapshot,
  TimeframeCode,
} from '../../core/market.repository';
import { WatchlistEntry, WatchlistRepository } from '../../core/watchlist.repository';
import { NewsItem, NewsRepository } from '../../core/news.repository';

const EMPTY_SNAPSHOT: TickerSnapshot = {
  quote: {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    currency: 'USD',
    exchange: 'NasdaqGS',
    price: 100,
    fiftyTwoWeekHigh: 120,
    fiftyTwoWeekLow: 80,
    asOf: '2025-01-01T00:00:00Z',
  },
  indicators: null,
  bars: [],
};

const SAMPLE_NARRATIVE: TickerNarrativeSnapshot = {
  id: 'snap-1',
  symbol: 'AAPL',
  generatedAt: '2026-05-02T12:00:00Z',
  price: 180,
  summary: 'Price above MA200 with rising momentum.',
  sentiment: 'BULLISH',
  keyPoints: ['Above MA200', 'RSI 62', '30d +5%'],
  modelUsed: 'claude:claude-opus-4-6',
  promptVersion: 'v1',
};

describe('TickerPage', () => {
  let component: TickerPage;
  let fixture: ComponentFixture<TickerPage>;
  let market: {
    getTicker: ReturnType<typeof vi.fn>;
    getChart: ReturnType<typeof vi.fn>;
    getSectorBenchmark: ReturnType<typeof vi.fn>;
    searchSymbols: ReturnType<typeof vi.fn>;
    requestNarrative: ReturnType<typeof vi.fn>;
    pollNarrativeJob: ReturnType<typeof vi.fn>;
    getLatestNarrative: ReturnType<typeof vi.fn>;
  };
  let watchlist: {
    list: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let news: { getForSymbol: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    market = {
      getTicker: vi.fn().mockReturnValue(of(EMPTY_SNAPSHOT)),
      getChart: vi.fn(),
      // Default : no benchmark calls. Tests that exercise the sector / custom paths override.
      getSectorBenchmark: vi.fn(),
      searchSymbols: vi.fn().mockReturnValue(of([])),
      requestNarrative: vi.fn(),
      pollNarrativeJob: vi.fn(),
      // Default : no narrative yet (first visit). Tests that need one override this.
      getLatestNarrative: vi.fn().mockReturnValue(of(null)),
    };
    watchlist = {
      // Default : symbol not on the watchlist (initial state for most tests).
      list: vi.fn().mockReturnValue(of([])),
      add: vi.fn(),
      remove: vi.fn(),
    };
    news = {
      // Default : no headlines (slow-news ticker / cache miss). Tests that exercise the populated
      // path override this.
      getForSymbol: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [TickerPage],
      providers: [
        provideTranslateService({ lang: 'en' }),
        { provide: MarketRepository, useValue: market },
        { provide: WatchlistRepository, useValue: watchlist },
        { provide: NewsRepository, useValue: news },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ symbol: 'AAPL' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TickerPage);
    component = fixture.componentInstance;
  });

  it('reads the symbol from the route and fetches the ticker on init', () => {
    fixture.detectChanges();
    expect(component.symbol()).toBe('AAPL');
    expect(market.getTicker).toHaveBeenCalledWith('AAPL');
    expect(component.snapshot()).toEqual(EMPTY_SNAPSHOT);
  });

  it('returns empty pricePath when fewer than 2 bars', () => {
    fixture.detectChanges();
    expect(component.pricePath()).toBe('');
  });

  it('rsiClass flags overbought and oversold zones', () => {
    // RSI ≥ 70 = overbought, RSI ≤ 30 = oversold — both warrant a `warning` chip color so the
    // user notices an extreme level without us editorialising what to do about it.
    component.snapshot.set({
      ...EMPTY_SNAPSHOT,
      indicators: { ...emptyIndicators(), rsi14: 75 },
    });
    expect(component.rsiClass()).toBe('warning');

    component.snapshot.set({
      ...EMPTY_SNAPSHOT,
      indicators: { ...emptyIndicators(), rsi14: 25 },
    });
    expect(component.rsiClass()).toBe('warning');

    // Mid-range = neutral chip (no class).
    component.snapshot.set({
      ...EMPTY_SNAPSHOT,
      indicators: { ...emptyIndicators(), rsi14: 50 },
    });
    expect(component.rsiClass()).toBe('');
  });

  it('drawdownClass turns danger below -20% and success above -5%', () => {
    // Three-tier scale : deep drawdown (≤ -20%) is `danger`, near-the-high (> -5%) is `success`.
    // The mid range (-20% .. -5%) falls back to neutral and isn't asserted here.
    component.snapshot.set({
      ...EMPTY_SNAPSHOT,
      indicators: { ...emptyIndicators(), drawdownFrom52wHigh: -25 },
    });
    expect(component.drawdownClass()).toBe('danger');

    component.snapshot.set({
      ...EMPTY_SNAPSHOT,
      indicators: { ...emptyIndicators(), drawdownFrom52wHigh: -2 },
    });
    expect(component.drawdownClass()).toBe('success');
  });

  // ---- Multi-timeframe chart ----

  /**
   * The chart toggle is decoupled from indicators / narrative on purpose : clicking 1M re-fetches
   * just the bars, leaves indicators frozen at the dossier's reference 1Y view (so RSI/MA/etc.
   * keep their semantic). The tests below pin that decoupling and the error path that surfaces
   * inline next to the chart rather than blowing up the dossier.
   */
  describe('chart timeframe', () => {
    const aBar: OhlcBar = {
      timestamp: '2026-04-15T00:00:00Z',
      open: 100,
      high: 103,
      low: 99,
      close: 102,
      volume: 1_000_000,
    };
    const bBar: OhlcBar = { ...aBar, timestamp: '2026-04-16T00:00:00Z', close: 105 };

    it('initial chart bars come from the dossier snapshot — no extra fetch', () => {
      // The dossier endpoint already returns 1Y bars. Re-fetching them via /chart on first paint
      // would burn an extra Twelve Data credit per page load — wasteful and unnecessary.
      const snapshotWithBars: TickerSnapshot = { ...EMPTY_SNAPSHOT, bars: [aBar, bBar] };
      market.getTicker.mockReturnValue(of(snapshotWithBars));
      fixture.detectChanges();

      expect(component.chartBars()).toEqual([aBar, bBar]);
      expect(component.selectedTimeframe()).toBe('1y');
      expect(market.getChart).not.toHaveBeenCalled();
    });

    it('selectTimeframe fetches new bars and updates chartBars + selectedTimeframe', () => {
      const resp: ChartResponse = {
        symbol: 'AAPL',
        timeframe: '1mo',
        range: '1mo',
        interval: '1d',
        bars: [aBar],
      };
      market.getChart.mockReturnValue(of(resp));
      fixture.detectChanges();

      component.selectTimeframe('1mo');

      expect(market.getChart).toHaveBeenCalledWith('AAPL', '1mo');
      expect(component.selectedTimeframe()).toBe('1mo');
      expect(component.chartBars()).toEqual([aBar]);
      expect(component.chartLoading()).toBe(false);
      expect(component.chartError()).toBeNull();
    });

    it('selectTimeframe is a no-op when re-clicking the already-selected code', () => {
      // mat-button-toggle emits on every click, including re-clicks. Without this guard each
      // re-click would burn a fresh /chart call.
      const snapshotWithBars: TickerSnapshot = { ...EMPTY_SNAPSHOT, bars: [aBar, bBar] };
      market.getTicker.mockReturnValue(of(snapshotWithBars));
      fixture.detectChanges();

      component.selectTimeframe('1y'); // already the default + chartBars populated

      expect(market.getChart).not.toHaveBeenCalled();
    });

    it('selectTimeframe surfaces errors inline without breaking the dossier', () => {
      // Chart errors must stay scoped to the chart panel — the indicators chips and the narrative
      // shouldn't disappear because Twelve Data hiccupped on a 5Y fetch. Without translations
      // loaded in the slice, `instant('ticker.errors.rateLimit')` returns the key itself —
      // sufficient to assert that *some* error string was set.
      market.getChart.mockReturnValue(throwError(() => ({ status: 503 })));
      fixture.detectChanges();

      component.selectTimeframe('5y');

      expect(component.chartError()).toContain('rateLimit');
      expect(component.chartLoading()).toBe(false);
      // The dossier (snapshot, indicators) is untouched.
      expect(component.snapshot()).toEqual(EMPTY_SNAPSHOT);
    });
  });

  // ---- Benchmark overlay ----

  /**
   * The benchmark overlay is opt-in (default off) and lazy : we don't burn a Twelve Data credit
   * on SPY/QQQ/IWM until the user explicitly toggles it. Tests below pin :
   *
   * - **Default off** — no `getChart('SPY', …)` on init, even when the dossier is loaded.
   * - **Toggle on** — `selectBenchmark('SPY')` fetches SPY at the active timeframe AND flips the
   *   chart's Y axis to percent return (so SPY at $500 can sit next to a $15 ticker without one
   *   being crushed flat).
   * - **Timeframe sync** — switching timeframe with benchmark on refetches both series so they
   *   stay aligned ; without this the benchmark would lag a timeframe behind.
   * - **Error scoping** — a Twelve Data hiccup on the benchmark must NOT clear the main chart
   *   or the dossier snapshot. Same isolation rule as the news panel.
   * - **Toggle off** — `selectBenchmark('off')` clears the bars / error and reverts to price mode.
   */
  describe('benchmark overlay', () => {
    const tickerBar = (close: number, ts = '2026-04-15T00:00:00Z'): OhlcBar => ({
      timestamp: ts,
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000,
    });

    const tickerBars = [tickerBar(100), tickerBar(110, '2026-04-16T00:00:00Z')];
    const benchBars = [tickerBar(200), tickerBar(210, '2026-04-16T00:00:00Z')];

    /**
     * Returns a `getChart` impl that distinguishes benchmark calls (SPY/QQQ/IWM) from ticker
     * calls — the benchmark gets [benchBars], anything else gets [tickerBars]. Centralises the
     * mock so each test only asserts the part it cares about.
     */
    function chartImpl(sym: string, tf: TimeframeCode): Observable<ChartResponse> {
      const isBench = sym === 'SPY' || sym === 'QQQ' || sym === 'IWM';
      const response: ChartResponse = {
        symbol: sym,
        timeframe: tf,
        range: tf,
        interval: '1d',
        bars: isBench ? benchBars : tickerBars,
      };
      return of(response);
    }

    it('starts with benchmark off and skips the fetch on init', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: tickerBars }));
      fixture.detectChanges();

      expect(component.selectedBenchmark()).toBe('off');
      // /chart was never called : neither for the ticker (snapshot already provides bars) nor
      // for any benchmark. The default state burns zero Twelve Data credits beyond /ticker.
      expect(market.getChart).not.toHaveBeenCalled();
    });

    it('selectBenchmark fetches the chosen index, flips Y axis to percent, draws a 2nd line', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: tickerBars }));
      market.getChart.mockImplementation(chartImpl);
      fixture.detectChanges();

      component.selectBenchmark('SPY');

      expect(market.getChart).toHaveBeenCalledWith('SPY', '1y');
      expect(component.benchmarkBars()).toEqual(benchBars);
      expect(component.benchmarkLoading()).toBe(false);
      const geom = component.chartGeometry();
      // benchmarkPath set → second polyline rendered. Y-axis labels carry a % suffix → the chart
      // is comparing returns, not prices.
      expect(geom?.benchmarkPath).toBeTruthy();
      expect(geom?.yTicks[0].label).toContain('%');
    });

    it('reclicking the active benchmark choice is a no-op (no extra getChart call)', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: tickerBars }));
      market.getChart.mockImplementation(chartImpl);
      fixture.detectChanges();

      component.selectBenchmark('SPY');
      expect(market.getChart).toHaveBeenCalledTimes(1);

      // Same value re-emitted by mat-button-toggle on a re-click — must not refetch.
      component.selectBenchmark('SPY');
      expect(market.getChart).toHaveBeenCalledTimes(1);
    });

    it('selectTimeframe with benchmark on refetches both series so they stay aligned', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: tickerBars }));
      market.getChart.mockImplementation(chartImpl);
      fixture.detectChanges();
      component.selectBenchmark('SPY'); // benchmark fetched at 1y
      market.getChart.mockClear();

      component.selectTimeframe('1mo');

      // Both calls must use the new timeframe — order matters less than that both happen.
      expect(market.getChart).toHaveBeenCalledWith('AAPL', '1mo');
      expect(market.getChart).toHaveBeenCalledWith('SPY', '1mo');
    });

    it('a benchmark fetch error stays scoped — the chart and snapshot survive', () => {
      const snapshotWithBars: TickerSnapshot = { ...EMPTY_SNAPSHOT, bars: tickerBars };
      market.getTicker.mockReturnValue(of(snapshotWithBars));
      market.getChart.mockReturnValue(throwError(() => ({ status: 503 })));
      fixture.detectChanges();

      component.selectBenchmark('SPY');

      // Inline benchmark error set ; main chart untouched (still has the dossier bars), snapshot
      // unchanged. Without translations loaded the i18n key ticker.benchmark.errors.fetch
      // surfaces verbatim — sufficient to assert *some* error message.
      expect(component.benchmarkError()).toContain('fetch');
      expect(component.benchmarkBars()).toEqual([]);
      expect(component.benchmarkLoading()).toBe(false);
      expect(component.chartBars()).toEqual(tickerBars);
      expect(component.chartError()).toBeNull();
      expect(component.snapshot()).toEqual(snapshotWithBars);
    });

    it('selectBenchmark(off) clears bars + error and drops the second line', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: tickerBars }));
      market.getChart.mockImplementation(chartImpl);
      fixture.detectChanges();
      component.selectBenchmark('SPY');
      expect(component.chartGeometry()?.benchmarkPath).toBeTruthy();

      component.selectBenchmark('off');

      expect(component.benchmarkBars()).toEqual([]);
      expect(component.benchmarkError()).toBeNull();
      expect(component.selectedBenchmark()).toBe('off');
      // Geometry reverts to single-series price mode : no benchmark path, Y labels back to plain
      // numbers (no % suffix).
      const geom = component.chartGeometry();
      expect(geom?.benchmarkPath).toBeUndefined();
      expect(geom?.yTicks[0].label).not.toContain('%');
    });
  });

  // ---- Benchmark overlay v2 — Sector + Custom ----

  /**
   * v2 adds two new picker modes : Sector (auto-detect the SPDR sector ETF for the dossier ticker)
   * and Custom (let the user pick any ticker via the autocomplete sidecar). Both build on the v1
   * resolved-benchmark plumbing — the Y-axis flip and the second polyline behave the same once a
   * benchmark is resolved. The tests below pin :
   *
   * - **Sector resolves via `/sector-benchmark` then fetches the ETF chart** — two-step flow, the
   *   first call returns the resolved ETF symbol, the second fetches its bars. The legend label
   *   reflects the sector ("Technology (XLK)") so the user knows what they're comparing against.
   * - **Sector 404 surfaces `sectorNotMapped` inline** — different message from the generic fetch
   *   error so the user knows to pick a preset instead.
   * - **Custom autocomplete pick switches mode + fetches the picked symbol** — the toggle group
   *   deselects (the value `'custom'` doesn't match any button), `resolvedBenchmark` is set, the
   *   chart fetches the picked ETF / stock.
   * - **Sync timeframe with sector active refetches the resolved ETF, NOT a re-resolve** — the
   *   sector resolve is a costly Twelve Data credit ; refetching just the bars is the right
   *   behaviour. Same for custom.
   * - **Switching from sector to a preset clears the resolved sector legend** — the legend should
   *   reflect the active mode, not stale state from the previous one.
   */
  describe('benchmark overlay v2 — sector + custom', () => {
    const tickerBar = (close: number, ts = '2026-04-15T00:00:00Z'): OhlcBar => ({
      timestamp: ts,
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000,
    });
    const tickerBars = [tickerBar(100), tickerBar(110, '2026-04-16T00:00:00Z')];
    const benchBars = [tickerBar(200), tickerBar(210, '2026-04-16T00:00:00Z')];

    const SECTOR_AAPL_XLK: SectorBenchmark = {
      tickerSymbol: 'AAPL',
      sector: 'Technology',
      etfSymbol: 'XLK',
      etfName: 'Technology Select Sector SPDR Fund',
    };

    /** Returns a `getChart` impl that yields `benchBars` for any non-AAPL symbol. Simpler than the
     *  v1 helper because v2 doesn't care whether the bench is a preset, ETF or arbitrary stock —
     *  the chart endpoint is symbol-agnostic. */
    function chartImpl(sym: string, tf: TimeframeCode): Observable<ChartResponse> {
      const isBench = sym !== 'AAPL';
      return of({
        symbol: sym,
        timeframe: tf,
        range: tf,
        interval: '1d',
        bars: isBench ? benchBars : tickerBars,
      });
    }

    it('Sector resolves via getSectorBenchmark then fetches the ETF chart', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: tickerBars }));
      market.getChart.mockImplementation(chartImpl);
      market.getSectorBenchmark.mockReturnValue(of(SECTOR_AAPL_XLK));
      fixture.detectChanges();

      component.selectBenchmark('sector');

      expect(market.getSectorBenchmark).toHaveBeenCalledWith('AAPL');
      // After the resolve, the legend label combines sector + ETF symbol so the user understands
      // what the dashed line represents.
      expect(component.resolvedBenchmark()).toEqual({
        symbol: 'XLK',
        label: 'Technology (XLK)',
      });
      // The chart endpoint is then hit for the resolved ETF, NOT for the dossier ticker.
      expect(market.getChart).toHaveBeenCalledWith('XLK', '1y');
      expect(component.benchmarkBars()).toEqual(benchBars);
    });

    it('Sector 404 surfaces sectorNotMapped inline and skips the chart fetch', () => {
      // Symbol unknown to the provider OR sector outside the SPDR mapping — both surface as 404.
      // The frontend shows a polite "no sector benchmark available" rather than the generic
      // "couldn't load" so the user knows to pick a preset instead.
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: tickerBars }));
      market.getChart.mockImplementation(chartImpl);
      market.getSectorBenchmark.mockReturnValue(throwError(() => ({ status: 404 })));
      fixture.detectChanges();

      component.selectBenchmark('sector');

      // i18n key surfaces verbatim in the slice (no translations loaded) — sufficient to pin.
      expect(component.benchmarkError()).toContain('sectorNotMapped');
      expect(component.benchmarkLoading()).toBe(false);
      expect(component.resolvedBenchmark()).toBeNull();
      // Chart endpoint must NOT be hit for any benchmark symbol — the dossier ticker AAPL was
      // already loaded by getTicker, so getChart should remain at zero calls.
      expect(market.getChart).not.toHaveBeenCalled();
      // The main chart and dossier are untouched.
      expect(component.chartBars()).toEqual(tickerBars);
      expect(component.chartError()).toBeNull();
    });

    it('Custom autocomplete pick switches mode and fetches the picked symbol', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: tickerBars }));
      market.getChart.mockImplementation(chartImpl);
      fixture.detectChanges();

      const msft: SymbolMatch = { symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ' };
      // The autocomplete picks emit a `MatAutocompleteSelectedEvent` whose `option.value` is the
      // SymbolMatch. We synthesize the minimal shape the handler reads — no need to mock the full
      // event class.
      component.onCustomBenchmarkSelected({
        option: { value: msft },
      } as unknown as Parameters<typeof component.onCustomBenchmarkSelected>[0]);

      expect(component.selectedBenchmark()).toBe('custom');
      expect(component.resolvedBenchmark()).toEqual({ symbol: 'MSFT', label: 'MSFT' });
      expect(market.getChart).toHaveBeenCalledWith('MSFT', '1y');
      expect(component.benchmarkBars()).toEqual(benchBars);
    });

    it('selectTimeframe with Sector active refetches the resolved ETF without re-resolving', () => {
      // Re-resolving the sector on every timeframe click would burn a Twelve Data credit per
      // click — confirm the cached resolve sticks and only the chart bars are refetched.
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: tickerBars }));
      market.getChart.mockImplementation(chartImpl);
      market.getSectorBenchmark.mockReturnValue(of(SECTOR_AAPL_XLK));
      fixture.detectChanges();
      component.selectBenchmark('sector');
      market.getChart.mockClear();
      market.getSectorBenchmark.mockClear();

      component.selectTimeframe('1mo');

      expect(market.getSectorBenchmark).not.toHaveBeenCalled();
      expect(market.getChart).toHaveBeenCalledWith('AAPL', '1mo');
      expect(market.getChart).toHaveBeenCalledWith('XLK', '1mo');
    });

    it('Switching from sector to a preset clears the resolved sector legend', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: tickerBars }));
      market.getChart.mockImplementation(chartImpl);
      market.getSectorBenchmark.mockReturnValue(of(SECTOR_AAPL_XLK));
      fixture.detectChanges();
      component.selectBenchmark('sector');
      expect(component.resolvedBenchmark()?.label).toBe('Technology (XLK)');

      component.selectBenchmark('SPY');

      // Legend reflects the active mode now (just the preset symbol), not the stale sector label.
      expect(component.resolvedBenchmark()).toEqual({ symbol: 'SPY', label: 'SPY' });
      expect(component.selectedBenchmark()).toBe('SPY');
    });
  });

  // ---- Watchlist toggle ----

  /**
   * The "Watch / Watching" button on the dossier header has three behaviours worth pinning :
   *
   * - **State derived from `list()`** on init — the button shows "Watching" if the symbol is
   *   already on the watchlist, "Watch" otherwise.
   * - **Optimistic toggle** — clicking flips the state immediately, then waits for the server.
   *   On error we roll back so the user sees their click didn't take rather than a fake success.
   * - **Disabled while busy** — prevents a rapid second click triggering an add+remove race
   *   that could end with an inconsistent state.
   */
  describe('watchlist toggle', () => {
    const watched: WatchlistEntry = {
      id: 'wl-1',
      symbol: 'AAPL',
      addedAt: '2026-05-03T10:00:00Z',
    };

    it('isWatched reflects whether the current symbol is on the list at init', async () => {
      watchlist.list.mockReturnValue(of([watched]));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.isWatched()).toBe(true);
    });

    it('isWatched defaults to false when the symbol is absent', async () => {
      // Default mock returns empty list. Pin the consequence : button starts in "Watch" state.
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.isWatched()).toBe(false);
    });

    it('toggleWatchlist calls add when not watched and flips the state optimistically', () => {
      watchlist.add.mockReturnValue(of(watched));
      fixture.detectChanges();

      component.toggleWatchlist();

      expect(watchlist.add).toHaveBeenCalledWith('AAPL');
      expect(component.isWatched()).toBe(true);
      expect(component.watchlistBusy()).toBe(false);
    });

    it('toggleWatchlist calls remove when watched and flips the state optimistically', async () => {
      watchlist.list.mockReturnValue(of([watched]));
      watchlist.remove.mockReturnValue(of(undefined));
      fixture.detectChanges();
      await fixture.whenStable();

      component.toggleWatchlist();

      expect(watchlist.remove).toHaveBeenCalledWith('AAPL');
      expect(component.isWatched()).toBe(false);
    });

    it('toggleWatchlist rolls back the optimistic flip when add fails', () => {
      watchlist.add.mockReturnValue(throwError(() => ({ status: 500 })));
      fixture.detectChanges();

      component.toggleWatchlist();

      // Was false (default), flipped to true optimistically, server failed → rolled back to false.
      expect(component.isWatched()).toBe(false);
      expect(component.watchlistBusy()).toBe(false);
    });

    it('toggleWatchlist is a no-op while a previous request is busy', () => {
      // A Subject lets us hold the request in PENDING and assert the second click is ignored.
      // `Subject` is already imported at the top of the file alongside `of` / `throwError`.
      const pending = new Subject<unknown>();
      watchlist.add.mockReturnValue(pending.asObservable());
      fixture.detectChanges();

      component.toggleWatchlist();
      expect(watchlist.add).toHaveBeenCalledTimes(1);

      // Second click while still busy — should not fire another POST.
      component.toggleWatchlist();
      expect(watchlist.add).toHaveBeenCalledTimes(1);
    });
  });

  // ---- News section ----

  /**
   * The news panel sits alongside the chart and narrative — error isolation matters : a Finnhub
   * 503 must NOT blank the indicators or hide the price. Tests below pin :
   *
   * - **Init load** — `getForSymbol(symbol)` is called on init with the route symbol.
   * - **Populated state** — items signal hydrates from the response, sorted as the backend sent
   *   them (the front trusts the backend's ordering).
   * - **Empty state** — empty list ≠ error ; signal stays empty, no error message.
   * - **Error scoping** — a 503 sets `newsError` only and leaves the dossier `snapshot()`
   *   untouched.
   */
  describe('news', () => {
    const sampleItem: NewsItem = {
      id: '1',
      symbol: 'AAPL',
      headline: 'Apple launches X',
      summary: null,
      source: 'Reuters',
      url: 'https://example.com/a',
      imageUrl: null,
      publishedAt: '2026-05-03T10:00:00Z',
      category: 'company news',
    };

    it('hydrates the news signal from getForSymbol on init', () => {
      news.getForSymbol.mockReturnValue(of([sampleItem]));
      fixture.detectChanges();

      expect(news.getForSymbol).toHaveBeenCalledWith('AAPL');
      expect(component.news()).toEqual([sampleItem]);
      expect(component.newsLoading()).toBe(false);
      expect(component.newsError()).toBeNull();
    });

    it('starts with an empty list when the ticker has no recent news', () => {
      // Default mock returns of([]). Pin the consequence : signal stays empty, no error message.
      // The empty state is rendered as "Pas d'actualité récente" — different UX from an error.
      fixture.detectChanges();

      expect(component.news()).toEqual([]);
      expect(component.newsError()).toBeNull();
    });

    it('surfaces a Finnhub error inline without breaking the rest of the dossier', () => {
      news.getForSymbol.mockReturnValue(throwError(() => ({ status: 503 })));
      fixture.detectChanges();

      // News panel shows an error string — exact message is the translation key in the slice
      // (without translations loaded).
      expect(component.newsError()).toContain('rateLimit');
      expect(component.newsLoading()).toBe(false);
      // Dossier core (snapshot, indicators) is untouched — error stays scoped.
      expect(component.snapshot()).toEqual(EMPTY_SNAPSHOT);
    });
  });

  function emptyIndicators() {
    return {
      asOf: '2025-01-01T00:00:00Z',
      price: 100,
      rsi14: null,
      ma50: null,
      ma200: null,
      momentum30d: null,
      momentum90d: null,
      perf1m: null,
      perf3m: null,
      perf1y: null,
      drawdownFrom52wHigh: null,
      volumeRelative30d: null,
      distanceToMa50Pct: null,
      distanceToMa200Pct: null,
    };
  }

  // ---- Narrative ----

  /**
   * The narrative section has three meaningful states the user can see :
   * - **Empty** (first visit, no snapshot yet) → "Pas encore de narratif" + "Générer" button.
   * - **Loading** (POST kicked, polling) → spinner + disabled button.
   * - **Loaded** (snapshot present) → summary + sentiment chip + bullets + "Régénérer" button.
   *
   * Tests below pin down the transitions between these states. The cache hit path
   * (POST returns `DONE` immediately) is also covered — it exists to skip the LLM call
   * when a snapshot < 30 min already exists.
   */
  describe('narrative', () => {
    it('loads the latest snapshot on init when one exists', () => {
      market.getLatestNarrative.mockReturnValue(of(SAMPLE_NARRATIVE));
      fixture.detectChanges();

      expect(component.narrative()).toEqual(SAMPLE_NARRATIVE);
      expect(market.getLatestNarrative).toHaveBeenCalledWith('AAPL');
    });

    it('starts with no narrative when none exists yet (404 → null)', () => {
      // Default mock returns of(null). Pin the consequence : the page accepts that quietly.
      fixture.detectChanges();
      expect(component.narrative()).toBeNull();
      expect(component.narrativeError()).toBeNull();
    });

    it('generateNarrative — cache hit (POST returns DONE) skips polling and fetches the snapshot', () => {
      const doneJob: TickerNarrativeJob = {
        jobId: 'j1',
        symbol: 'AAPL',
        status: 'DONE',
        createdAt: '2026-05-02T12:00:00Z',
        snapshotId: 'snap-1',
        error: null,
      };
      market.requestNarrative.mockReturnValue(of(doneJob));
      market.getLatestNarrative.mockReturnValue(of(SAMPLE_NARRATIVE));
      fixture.detectChanges();

      component.generateNarrative();

      expect(market.requestNarrative).toHaveBeenCalledWith('AAPL');
      // Polling NOT triggered — cache hit means the runner never fired.
      expect(market.pollNarrativeJob).not.toHaveBeenCalled();
      expect(component.narrative()).toEqual(SAMPLE_NARRATIVE);
      expect(component.narrativeLoading()).toBe(false);
    });

    it('generateNarrative — fresh kick (POST returns PENDING) polls then loads on DONE', () => {
      const pendingJob: TickerNarrativeJob = {
        jobId: 'j1',
        symbol: 'AAPL',
        status: 'PENDING',
        createdAt: '2026-05-02T12:00:00Z',
        snapshotId: null,
        error: null,
      };
      const pollSubject = new Subject<TickerNarrativeJob>();
      market.requestNarrative.mockReturnValue(of(pendingJob));
      market.pollNarrativeJob.mockReturnValue(pollSubject.asObservable());
      market.getLatestNarrative.mockReturnValue(of(SAMPLE_NARRATIVE));
      fixture.detectChanges();

      component.generateNarrative();
      // Loading flips on between POST and the first non-PENDING poll emission.
      expect(component.narrativeLoading()).toBe(true);

      pollSubject.next({ ...pendingJob, status: 'DONE', snapshotId: 'snap-1' });

      expect(component.narrative()).toEqual(SAMPLE_NARRATIVE);
      expect(component.narrativeLoading()).toBe(false);
    });

    it('generateNarrative — surfaces job error and clears loading', () => {
      const errJob: TickerNarrativeJob = {
        jobId: 'j1',
        symbol: 'AAPL',
        status: 'ERROR',
        createdAt: '2026-05-02T12:00:00Z',
        snapshotId: null,
        error: 'LLM timeout',
      };
      market.requestNarrative.mockReturnValue(of(errJob));
      fixture.detectChanges();

      component.generateNarrative();

      expect(component.narrativeError()).toBe('LLM timeout');
      expect(component.narrativeLoading()).toBe(false);
    });

    it('generateNarrative — surfaces poll abort error', () => {
      const pendingJob: TickerNarrativeJob = {
        jobId: 'j1',
        symbol: 'AAPL',
        status: 'PENDING',
        createdAt: '2026-05-02T12:00:00Z',
        snapshotId: null,
        error: null,
      };
      market.requestNarrative.mockReturnValue(of(pendingJob));
      market.pollNarrativeJob.mockReturnValue(
        throwError(() => new Error('Génération trop longue')),
      );
      fixture.detectChanges();

      component.generateNarrative();

      expect(component.narrativeError()).toContain('trop longue');
      expect(component.narrativeLoading()).toBe(false);
    });

    it('sentimentClass derives the css class from the sentiment value', () => {
      expect(component.sentimentClass(SAMPLE_NARRATIVE)).toBe('sentiment-bullish');
      expect(component.sentimentClass({ ...SAMPLE_NARRATIVE, sentiment: 'BEARISH' })).toBe(
        'sentiment-bearish',
      );
      expect(component.sentimentClass(null)).toBe('');
    });
  });
});
