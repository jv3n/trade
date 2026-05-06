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
import { Annotation, AnnotationRepository } from '../../core/annotation.repository';
import { AnalystRepository, AnalystSnapshot } from '../../core/analyst.repository';
import { EarningsRepository, EarningsSnapshot } from '../../core/earnings.repository';

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
  let annotationStore: {
    list: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let analyst: { getForSymbol: ReturnType<typeof vi.fn> };
  let earnings: { getForSymbol: ReturnType<typeof vi.fn> };

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
    annotationStore = {
      // Default : empty store (fresh ticker, never annotated). Tests that exercise add/remove
      // override `list` to return preloaded annotations.
      list: vi.fn().mockReturnValue(of([])),
      add: vi.fn(),
      remove: vi.fn().mockReturnValue(of(void 0)),
    };
    analyst = {
      // Default : 404 (no coverage) so tests that don't care about the panel see the empty
      // state. Tests that exercise the populated / error paths override.
      getForSymbol: vi.fn().mockReturnValue(throwError(() => ({ status: 404 }))),
    };
    earnings = {
      // Default : 404 (no data) so tests that don't care about the panel see the empty state.
      // Tests that exercise the populated / error / null-calendar paths override.
      getForSymbol: vi.fn().mockReturnValue(throwError(() => ({ status: 404 }))),
    };

    await TestBed.configureTestingModule({
      imports: [TickerPage],
      providers: [
        provideTranslateService({ lang: 'en' }),
        { provide: MarketRepository, useValue: market },
        { provide: WatchlistRepository, useValue: watchlist },
        { provide: NewsRepository, useValue: news },
        { provide: AnnotationRepository, useValue: annotationStore },
        { provide: AnalystRepository, useValue: analyst },
        { provide: EarningsRepository, useValue: earnings },
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

  // ---- Chart zoom (v1) + overlays (v2) ----

  /**
   * v1 adds a drag-select zoom on the chart (mousedown + horizontal drag → zoom to the X range)
   * with a reset via either the toolbar button or a chart double-click. v2 adds 5 multi-select
   * overlays (MA50, MA200, Bollinger bands, 52w high/low) computed front-side from the loaded
   * bars. Both behaviours sit on top of the existing geometry computed — the tests below pin :
   *
   * - **Zoom commits via signal-driven slicing** — the geometry slices both ticker and benchmark
   *   bars by `zoomRange` indices ; the visible `points` array length equals `endIdx - startIdx`.
   * - **Drag below threshold ignored** — a stationary or barely-moved click must not trigger a
   *   1-bar zoom (which would crash the geometry's `bars.length < 2` guard).
   * - **Timeframe change clears the zoom** — bar indices don't translate across `1d → 5y` etc.,
   *   so we drop the zoom rather than show a confusing slice of the new timeframe's bars.
   * - **Overlays toggled in benchmark mode are inert** — the Y axis is in % return space then,
   *   price-level overlays (MA50, 52w hi) don't share that coordinate system.
   * - **Bollinger pushes 3 paths, MA50/MA200 push 1 each, 52w hi/lo push h-lines** — the
   *   overlay rendering is content-driven by the `overlayPaths` and `overlayHLines` arrays in
   *   the geometry.
   */
  describe('chart zoom + overlays (v1+v2)', () => {
    function makeBars(n: number): OhlcBar[] {
      const out: OhlcBar[] = [];
      for (let i = 0; i < n; i++) {
        const close = 100 + i * 0.5;
        out.push({
          timestamp: `2026-04-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
          open: close,
          high: close + 1,
          low: close - 1,
          close,
          volume: 1_000_000,
        });
      }
      return out;
    }

    it('drag-zoom commits a new zoomRange and the geometry slices to the visible window', () => {
      const bars = makeBars(60);
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars }));
      fixture.detectChanges();

      // Synthesize a pointerdown → pointerup pair on the chart-canvas. Each event needs a
      // currentTarget with a child <svg> exposing the same getScreenCTM contract the component
      // uses to map screen X to SVG user units. We stub the CTM to identity so x in == x out.
      const fakeSvg = {
        getScreenCTM: () => ({ inverse: () => ({}) }),
        createSVGPoint: () => ({
          x: 0,
          y: 0,
          matrixTransform: function () {
            return { x: this.x, y: this.y };
          },
        }),
      } as unknown as SVGSVGElement;
      const fakeTarget = {
        querySelector: () => fakeSvg,
        setPointerCapture: vi.fn(),
      } as unknown as HTMLElement;
      const ev = (clientX: number, button = 0): PointerEvent =>
        ({
          button,
          pointerId: 1,
          clientX,
          clientY: 0,
          currentTarget: fakeTarget,
        }) as unknown as PointerEvent;

      // Drag from x=200 to x=600 in inner-area coordinates — clearly above the threshold.
      component.onChartPointerDown(ev(200));
      component.onChartPointerMove(ev(600));
      component.onChartPointerUp(ev(600));

      const zoom = component.zoomRange();
      expect(zoom).not.toBeNull();
      // The geometry's points array now reflects only the zoomed range.
      const geom = component.chartGeometry();
      expect(geom).not.toBeNull();
      expect(geom!.points.length).toBeLessThan(bars.length);
      expect(geom!.points.length).toBeGreaterThan(1);
    });

    it('drag below threshold is ignored — no zoom committed', () => {
      const bars = makeBars(60);
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars }));
      fixture.detectChanges();

      const fakeSvg = {
        getScreenCTM: () => ({ inverse: () => ({}) }),
        createSVGPoint: () => ({
          x: 0,
          y: 0,
          matrixTransform: function () {
            return { x: this.x, y: this.y };
          },
        }),
      } as unknown as SVGSVGElement;
      const fakeTarget = {
        querySelector: () => fakeSvg,
        setPointerCapture: vi.fn(),
      } as unknown as HTMLElement;
      const ev = (clientX: number): PointerEvent =>
        ({
          button: 0,
          pointerId: 1,
          clientX,
          clientY: 0,
          currentTarget: fakeTarget,
        }) as unknown as PointerEvent;

      // 5px move — below the 10px threshold. Common when the user mis-clicks slightly.
      component.onChartPointerDown(ev(300));
      component.onChartPointerMove(ev(305));
      component.onChartPointerUp(ev(305));

      expect(component.zoomRange()).toBeNull();
    });

    it('selectTimeframe clears the active zoom — bar indices do not translate across timeframes', () => {
      const bars = makeBars(60);
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars }));
      market.getChart.mockReturnValue(
        of({ symbol: 'AAPL', timeframe: '1mo', range: '1mo', interval: '1d', bars: makeBars(20) }),
      );
      fixture.detectChanges();

      // Manually pin a zoom (simulate post-drag state) so we can verify the reset.
      component.zoomRange.set({ startIdx: 10, endIdx: 30 });
      expect(component.zoomRange()).not.toBeNull();

      component.selectTimeframe('1mo');

      expect(component.zoomRange()).toBeNull();
    });

    it('resetZoom clears zoomRange', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(40) }));
      fixture.detectChanges();
      component.zoomRange.set({ startIdx: 5, endIdx: 25 });

      component.resetZoom();

      expect(component.zoomRange()).toBeNull();
    });

    it('toggling MA50 + MA200 + Bollinger renders one overlay path each (3 for Bollinger)', () => {
      // 60 bars is enough for MA50 to have non-null cells (10 of them) but MA200 stays all-null
      // — that's fine, the path is still pushed (with empty `d`) and the geometry doesn't crash.
      // Realistically we'd want 200+ bars for MA200 to draw, but the test asserts the content-
      // driven rendering, not the warmup math (covered by `rollingMean` correctness).
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(60) }));
      fixture.detectChanges();

      component.setOverlays(['ma50', 'ma200', 'boll']);

      const geom = component.chartGeometry();
      expect(geom).not.toBeNull();
      const kinds = geom!.overlayPaths.map((p) => p.kind);
      expect(kinds).toContain('ma50');
      expect(kinds).toContain('ma200');
      expect(kinds).toContain('boll-upper');
      expect(kinds).toContain('boll-middle');
      expect(kinds).toContain('boll-lower');
      // 5 series-based overlays total (1 MA50 + 1 MA200 + 3 Bollinger bands).
      expect(geom!.overlayPaths.length).toBe(5);
    });

    it('52w hi/lo toggles add horizontal lines drawn from the dossier quote', () => {
      // EMPTY_SNAPSHOT.quote.fiftyTwoWeekHigh = 120, .fiftyTwoWeekLow = 80 — bars at close ~100
      // sit between, so both lines are visible without clamping.
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(40) }));
      fixture.detectChanges();

      component.setOverlays(['hi52w', 'lo52w']);

      const geom = component.chartGeometry();
      expect(geom).not.toBeNull();
      const kinds = geom!.overlayHLines.map((h) => h.kind);
      expect(kinds).toEqual(['hi52w', 'lo52w']);
      expect(geom!.overlayHLines[0].label).toContain('120');
      expect(geom!.overlayHLines[1].label).toContain('80');
    });

    it('MA50 stays computed on the full series even when zoomed', () => {
      // Regression : a previous version computed MA50 from the *visible* (sliced) bars, which
      // turned a 30-bar zoom into 30 nulls and made the MA line vanish under zoom. Pin the fix —
      // the full-series MA50 must still produce a non-empty path when the user zooms past bar 50.
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(120) }));
      fixture.detectChanges();
      component.setOverlays(['ma50']);

      // Zoom on bars 60..89 — only 30 visible, but MA50 has values for all of them since it was
      // computed on the full 120-bar series.
      component.zoomRange.set({ startIdx: 60, endIdx: 89 });

      const geom = component.chartGeometry();
      const ma50 = geom!.overlayPaths.find((p) => p.kind === 'ma50');
      expect(ma50).toBeDefined();
      expect(ma50!.d).not.toBe('');
      // Path covers every visible bar (30 segments → 30 'M'/'L' commands).
      const moves = ma50!.d.split(/[ML]/).filter((s) => s.trim().length > 0);
      expect(moves.length).toBe(30);
    });

    it('overlays are hidden when benchmark mode is active (Y axis is in % return)', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(60) }));
      market.getChart.mockReturnValue(
        of({ symbol: 'SPY', timeframe: '1y', range: '1y', interval: '1d', bars: makeBars(60) }),
      );
      fixture.detectChanges();

      component.setOverlays(['ma50', 'hi52w']);
      // Sanity : overlays are present in price mode.
      expect(component.chartGeometry()!.overlayPaths.length).toBe(1);
      expect(component.chartGeometry()!.overlayHLines.length).toBe(1);

      component.selectBenchmark('SPY');

      // Once benchmark is on, the geometry skips overlay computation. The signal still holds
      // the user's choice — a switch back to 'off' restores the overlays without re-toggling.
      expect(component.chartGeometry()!.overlayPaths.length).toBe(0);
      expect(component.chartGeometry()!.overlayHLines.length).toBe(0);
      expect(component.overlayActive().has('ma50')).toBe(true);
    });
  });

  // ---- Chart v3 — brush + annotations + measure tools ----

  /**
   * v3 layers three new interactions on top of the v1+v2 chart :
   *
   * - **Brush mini-chart** — bottom navigator that mirrors the full series and lets the user
   *   pan / resize the zoom range by dragging its rectangle, or reset zoom by clicking outside.
   * - **Annotations** — persisted horizontal price lines (localStorage), placed by clicking on
   *   the chart while annotation mode is armed. Survive ticker re-visits.
   * - **Measure tools** — single click sets a reference anchor at the bar nearest the cursor ;
   *   the hover tooltip then shows delta % + delta time from that anchor.
   *
   * Click-vs-drag distinction is shared with v1's drag-zoom (threshold 10px) — the tests below
   * pin the integration : clicks land on annotation/measure, drags land on zoom. Benchmark mode
   * disables annotations + measure (Y axis is in % return space, both features are price-anchored).
   */
  describe('chart v3 — brush + annotations + measure', () => {
    function makeBars(n: number): OhlcBar[] {
      const out: OhlcBar[] = [];
      for (let i = 0; i < n; i++) {
        const close = 100 + i * 0.5;
        out.push({
          // Daily bars Apr 1..Apr 1+n-1, padded for short months — the timestamp uniqueness is
          // what matters for the anchor lookup, not the actual day.
          timestamp: new Date(2026, 3, 1 + i).toISOString(),
          open: close,
          high: close + 1,
          low: close - 1,
          close,
          volume: 1_000_000,
        });
      }
      return out;
    }

    /** Synthesizes a PointerEvent on the chart-canvas, with a fake currentTarget that exposes
     *  the same SVG-CTM contract the component reads from. The CTM is identity so clientX
     *  passes through as the SVG user-units X. */
    function fakeChartEvent(clientX: number, clientY = 0, button = 0): PointerEvent {
      const fakeSvg = {
        getScreenCTM: () => ({ inverse: () => ({}) }),
        createSVGPoint: () => ({
          x: 0,
          y: 0,
          matrixTransform: function () {
            return { x: this.x, y: this.y };
          },
        }),
      } as unknown as SVGSVGElement;
      const fakeTarget = {
        querySelector: () => fakeSvg,
        setPointerCapture: vi.fn(),
      } as unknown as HTMLElement;
      return {
        button,
        pointerId: 1,
        clientX,
        clientY,
        currentTarget: fakeTarget,
        target: fakeTarget,
      } as unknown as PointerEvent;
    }

    it('hydrates annotations from the AnnotationRepository on init', () => {
      const stored: Annotation[] = [
        { id: 'a1', symbol: 'AAPL', kind: 'hline', value: 105, label: null },
      ];
      annotationStore.list.mockReturnValue(of(stored));
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(40) }));
      fixture.detectChanges();

      expect(annotationStore.list).toHaveBeenCalledWith('AAPL');
      expect(component.annotations()).toEqual(stored);
      // The annotation is laid out in the geometry's renderable list.
      const geom = component.chartGeometry();
      expect(geom?.annotations.length).toBe(1);
      expect(geom?.annotations[0].id).toBe('a1');
    });

    it('toggling annotation mode then sub-threshold click commits an annotation at the clicked price', () => {
      const created: Annotation = {
        id: 'a-new',
        symbol: 'AAPL',
        kind: 'hline',
        value: 50,
        label: null,
      };
      annotationStore.add.mockReturnValue(of(created));
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(40) }));
      fixture.detectChanges();

      component.toggleAnnotationMode();
      expect(component.annotationMode()).toBe(true);

      // Sub-threshold click (5px move = below the 10px zoom threshold). The Y coordinate maps
      // to a price via inverse-yAt — we don't pin the exact price (depends on geometry's min/max
      // including the snapshot 52w which the test sets to 80/120) ; we just verify add was
      // called with a kind: 'hline' payload.
      component.onChartPointerDown(fakeChartEvent(300, 100));
      component.onChartPointerMove(fakeChartEvent(303, 100));
      component.onChartPointerUp(fakeChartEvent(303, 100));

      expect(annotationStore.add).toHaveBeenCalledWith(
        'AAPL',
        expect.objectContaining({ kind: 'hline', label: null }),
      );
      expect(component.annotations()).toContainEqual(created);
      // Mode auto-disarms after one placement so the user opts in fresh for each annotation.
      expect(component.annotationMode()).toBe(false);
    });

    it('removeAnnotation drops the entry optimistically and calls the store', () => {
      const stored: Annotation[] = [
        { id: 'a1', symbol: 'AAPL', kind: 'hline', value: 105, label: null },
        { id: 'a2', symbol: 'AAPL', kind: 'hline', value: 95, label: null },
      ];
      annotationStore.list.mockReturnValue(of(stored));
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(40) }));
      fixture.detectChanges();

      component.removeAnnotation('a1');

      // Optimistic update — the signal drops the entry before the observable resolves.
      expect(component.annotations().map((a) => a.id)).toEqual(['a2']);
      expect(annotationStore.remove).toHaveBeenCalledWith('AAPL', 'a1');
    });

    it('onAnnotationDeleteKey activates remove on Enter and Space, ignores other keys', () => {
      // ARIA `role="button"` requires both Enter and Space activation. The handler also calls
      // preventDefault on Space so the page doesn't scroll behind the chart.
      const stored: Annotation[] = [
        { id: 'a1', symbol: 'AAPL', kind: 'hline', value: 105, label: null },
      ];
      annotationStore.list.mockReturnValue(of(stored));
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(40) }));
      fixture.detectChanges();

      const fakeKey = (key: string): KeyboardEvent =>
        ({ key, preventDefault: vi.fn() }) as unknown as KeyboardEvent;

      // 'Tab' is a no-op — focus traversal must NOT remove the annotation.
      component.onAnnotationDeleteKey(fakeKey('Tab'), 'a1');
      expect(annotationStore.remove).not.toHaveBeenCalled();
      expect(component.annotations().map((a) => a.id)).toEqual(['a1']);

      // Enter activates.
      component.onAnnotationDeleteKey(fakeKey('Enter'), 'a1');
      expect(annotationStore.remove).toHaveBeenCalledWith('AAPL', 'a1');
      expect(component.annotations()).toEqual([]);

      // Re-seed and assert Space activates too — covers the second activation key.
      annotationStore.list.mockReturnValue(of(stored));
      annotationStore.remove.mockClear();
      component.annotations.set(stored);
      const spaceEv = fakeKey(' ');
      component.onAnnotationDeleteKey(spaceEv, 'a1');
      expect(annotationStore.remove).toHaveBeenCalledWith('AAPL', 'a1');
      expect(spaceEv.preventDefault).toHaveBeenCalled();
    });

    it('sub-threshold click without annotation mode sets the measure anchor at the nearest bar', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(40) }));
      fixture.detectChanges();

      component.onChartPointerDown(fakeChartEvent(400));
      component.onChartPointerMove(fakeChartEvent(402));
      component.onChartPointerUp(fakeChartEvent(402));

      const anchor = component.measureAnchor();
      expect(anchor).not.toBeNull();
      // Anchor's price comes from a real bar's close.
      const closes = component.chartBars().map((b) => b.close);
      expect(closes).toContain(anchor!.price);
    });

    it('re-clicking the anchored bar clears the anchor (toggle behavior)', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(40) }));
      fixture.detectChanges();

      // First click sets the anchor.
      component.onChartPointerDown(fakeChartEvent(400));
      component.onChartPointerUp(fakeChartEvent(400));
      const firstAnchor = component.measureAnchor();
      expect(firstAnchor).not.toBeNull();

      // Re-click the same X → same bar → toggles off.
      component.onChartPointerDown(fakeChartEvent(400));
      component.onChartPointerUp(fakeChartEvent(400));
      expect(component.measureAnchor()).toBeNull();
    });

    it('clearMeasureAnchor resets the anchor', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(40) }));
      fixture.detectChanges();
      component.measureAnchor.set({
        index: 5,
        price: 102.5,
        timestamp: makeBars(40)[5].timestamp,
      });

      component.clearMeasureAnchor();

      expect(component.measureAnchor()).toBeNull();
    });

    it('hoverInfo exposes deltaPercent + deltaTime when an anchor is set', () => {
      const bars = makeBars(40);
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars }));
      fixture.detectChanges();

      component.measureAnchor.set({
        index: 5,
        price: bars[5].close,
        timestamp: bars[5].timestamp,
      });
      // Simulate hover at index 15 by setting hoveredIndex directly — the move handler logic
      // is covered elsewhere ; here we focus on the delta computation.
      (component as unknown as { hoveredIndex: { set: (v: number) => void } }).hoveredIndex.set(15);

      const hi = component.hoverInfo();
      expect(hi).not.toBeNull();
      expect(hi!.deltaPercent).not.toBeNull();
      expect(hi!.deltaTime).not.toBeNull();
      // Bars 5 and 15 are 10 days apart → "+10 j".
      expect(hi!.deltaTime).toContain('10');
      expect(hi!.deltaTime).toContain('j');
    });

    it('annotationMode and measure anchor are disabled in benchmark mode', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(40) }));
      market.getChart.mockReturnValue(
        of({ symbol: 'SPY', timeframe: '1y', range: '1y', interval: '1d', bars: makeBars(40) }),
      );
      fixture.detectChanges();
      component.selectBenchmark('SPY');

      // toggleAnnotationMode is a no-op while benchmark is active.
      component.toggleAnnotationMode();
      expect(component.annotationMode()).toBe(false);

      // Click on chart while in benchmark mode does NOT set the measure anchor.
      component.onChartPointerDown(fakeChartEvent(400));
      component.onChartPointerUp(fakeChartEvent(400));
      expect(component.measureAnchor()).toBeNull();

      // Annotations from the geometry are also empty in benchmark mode.
      expect(component.chartGeometry()!.annotations).toEqual([]);
    });

    it('brush geometry mirrors the full series and reflects the current zoom range', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(40) }));
      fixture.detectChanges();

      // No zoom : rectangle covers the full inner width.
      const fullBrush = component.brushGeometry();
      expect(fullBrush).not.toBeNull();
      expect(fullBrush!.rectX).toBeCloseTo(fullBrush!.innerLeft, 0);
      expect(fullBrush!.rectX + fullBrush!.rectWidth).toBeCloseTo(fullBrush!.innerRight, 0);

      // Zoom in : rectangle width shrinks proportionally.
      component.zoomRange.set({ startIdx: 10, endIdx: 30 });
      const zoomedBrush = component.brushGeometry();
      expect(zoomedBrush!.rectWidth).toBeLessThan(fullBrush!.rectWidth);
    });

    it('brush click outside the selector rectangle resets the zoom', () => {
      market.getTicker.mockReturnValue(of({ ...EMPTY_SNAPSHOT, bars: makeBars(40) }));
      fixture.detectChanges();
      component.zoomRange.set({ startIdx: 10, endIdx: 30 });

      // brush rect is between roughly x=247..544 (for 40 bars, padLeft=56, brushWidth=800,
      // padRight=12). Clicking at x=100 falls outside on the left → reset.
      const fakeSvg = {
        getScreenCTM: () => ({ inverse: () => ({}) }),
        createSVGPoint: () => ({
          x: 0,
          y: 0,
          matrixTransform: function () {
            return { x: this.x, y: this.y };
          },
        }),
      } as unknown as SVGSVGElement;
      // Brush listener is on the SVG itself (not a wrapper div), so currentTarget IS the SVG.
      const brushEvent = (clientX: number): PointerEvent =>
        ({
          button: 0,
          pointerId: 2,
          clientX,
          clientY: 30,
          currentTarget: fakeSvg,
          target: fakeSvg,
        }) as unknown as PointerEvent;

      component.onBrushPointerDown(brushEvent(100));

      expect(component.zoomRange()).toBeNull();
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

  // ---- Fundamentals — analyst recommendations ----

  /**
   * The "Fondamentaux" card sits between the chart's chip indicators and the news panel. The first
   * sub-block is "Recommandations analystes" — a segmented breakdown bar + consensus chip + price
   * target + history-driven trend arrow. Three terminal states are mutually exclusive after init :
   *
   * - **populated** → `analyst()` is the snapshot, the bar/chips/target render.
   * - **no coverage** (HTTP 404) → `analystNotCovered()` flips, panel shows an empty-state line.
   * - **upstream error** (HTTP 503) → `analystError()` set, panel shows an inline error banner.
   *
   * The dossier core (snapshot, chart, narrative) survives every error path — same isolation rule
   * as the news panel.
   */
  describe('analyst recommendations', () => {
    const populatedSnapshot: AnalystSnapshot = {
      symbol: 'AAPL',
      asOf: '2026-04-01',
      strongBuy: 7,
      buy: 5,
      hold: 3,
      sell: 1,
      strongSell: 0,
      totalAnalysts: 16,
      consensus: 'BUY',
      priceTarget: {
        high: 280,
        low: 175,
        mean: 235.5,
        median: 240,
        numberOfAnalysts: 41,
      },
      history: [
        { period: '2025-11-01', strongBuy: 4, buy: 5, hold: 5, sell: 1, strongSell: 1 },
        { period: '2025-12-01', strongBuy: 5, buy: 5, hold: 4, sell: 1, strongSell: 1 },
        { period: '2026-01-01', strongBuy: 5, buy: 6, hold: 4, sell: 1, strongSell: 0 },
        { period: '2026-02-01', strongBuy: 6, buy: 6, hold: 3, sell: 1, strongSell: 0 },
        { period: '2026-03-01', strongBuy: 6, buy: 5, hold: 4, sell: 1, strongSell: 0 },
        { period: '2026-04-01', strongBuy: 7, buy: 5, hold: 3, sell: 1, strongSell: 0 },
      ],
    };

    it('hydrates the snapshot on init when the symbol is covered', () => {
      analyst.getForSymbol.mockReturnValue(of(populatedSnapshot));
      fixture.detectChanges();

      expect(analyst.getForSymbol).toHaveBeenCalledWith('AAPL');
      expect(component.analyst()).toEqual(populatedSnapshot);
      expect(component.analystLoading()).toBe(false);
      expect(component.analystError()).toBeNull();
      expect(component.analystNotCovered()).toBe(false);
    });

    it('surfaces the no-coverage state on a 404', () => {
      // Default mock returns 404 — assert the empty-state flag flips and no error banner is set.
      // The dossier core stays untouched.
      fixture.detectChanges();

      expect(component.analystNotCovered()).toBe(true);
      expect(component.analyst()).toBeNull();
      expect(component.analystError()).toBeNull();
      expect(component.snapshot()).toEqual(EMPTY_SNAPSHOT);
    });

    it('surfaces a Finnhub 503 inline without breaking the rest of the dossier', () => {
      analyst.getForSymbol.mockReturnValue(throwError(() => ({ status: 503 })));
      fixture.detectChanges();

      // Inline error string set, dossier core untouched. Same rule as the news panel.
      expect(component.analystError()).toContain('rateLimit');
      expect(component.analystNotCovered()).toBe(false);
      expect(component.analyst()).toBeNull();
      expect(component.snapshot()).toEqual(EMPTY_SNAPSHOT);
    });

    it('analystBucketPct returns proportions that sum to 100 across the five buckets', () => {
      // The segmented bar's widths are driven by this method ; without it the bar would collapse
      // or overflow. We pin the contract : sum across the five buckets is always 100 % when the
      // snapshot is populated.
      analyst.getForSymbol.mockReturnValue(of(populatedSnapshot));
      fixture.detectChanges();

      const sum =
        component.analystBucketPct('strongBuy') +
        component.analystBucketPct('buy') +
        component.analystBucketPct('hold') +
        component.analystBucketPct('sell') +
        component.analystBucketPct('strongSell');
      expect(sum).toBeCloseTo(100, 5);
    });

    it('analystBucketPct returns 0 before the snapshot lands so the template can render unconditionally', () => {
      // Default mock returns 404 → snapshot stays null. Calling the helper at that moment must
      // not throw and must yield 0 — the template binds it on `[style.width.%]` even before the
      // panel has data (Angular evaluates the binding once per change detection pass).
      fixture.detectChanges();

      expect(component.analystBucketPct('buy')).toBe(0);
    });

    it('analystTrend reads "up" when the bullish-minus-bearish fraction climbs over the window', () => {
      // History above starts at (4+5)−(1+1) = 7 / 16 = 0.44, ends at (7+5)−(1+0) = 11 / 16 = 0.69.
      // Delta 0.25 ≫ 0.05 epsilon → up.
      analyst.getForSymbol.mockReturnValue(of(populatedSnapshot));
      fixture.detectChanges();

      expect(component.analystTrend()).toBe('up');
    });

    it('analystTrend reads "flat" on a stable history within the epsilon band', () => {
      // Six identical snapshots → delta 0 → flat. Pins the epsilon path : a 0/0 score is honest,
      // not "down" by accident.
      const flat = {
        ...populatedSnapshot,
        history: populatedSnapshot.history.map((h) => ({
          ...h,
          strongBuy: 5,
          buy: 5,
          hold: 5,
          sell: 1,
          strongSell: 0,
        })),
      };
      analyst.getForSymbol.mockReturnValue(of(flat));
      fixture.detectChanges();

      expect(component.analystTrend()).toBe('flat');
    });

    it('analystTrend reads "flat" when there is no snapshot yet', () => {
      // Default mock = 404 → analyst() null → trend defaults to flat (no editorialising on
      // missing data).
      fixture.detectChanges();

      expect(component.analystTrend()).toBe('flat');
    });
  });

  // ---- Fundamentals — earnings ----

  /**
   * The "Fondamentaux" card now hosts a 2nd sub-block (after analyst recommendations) — earnings.
   * It surfaces the next expected announcement (with a countdown) and the last 4 quarterly reports
   * (EPS estimate vs actual + surprise %). Three terminal states are mutually exclusive after init :
   *
   * - **populated** → `earnings()` is the snapshot, the next-line + reports table render.
   * - **no data** (HTTP 404) → `earningsNotCovered()` flips, panel shows an empty-state line.
   * - **upstream error** (HTTP 503) → `earningsError()` set, panel shows an inline error banner.
   *
   * The dossier core (snapshot, chart, narrative, analyst) survives every error path — same
   * isolation rule as the news and analyst panels.
   */
  describe('earnings', () => {
    const populatedSnapshot: EarningsSnapshot = {
      symbol: 'AAPL',
      nextEarningsDate: '2026-05-12',
      nextEarningsTime: 'AFTER_MARKET',
      lastReports: [
        { period: '2025-03-31', epsEstimate: 1.0, epsActual: 1.1, surprisePercent: 10.0 },
        { period: '2025-06-30', epsEstimate: 1.05, epsActual: 1.12, surprisePercent: 6.67 },
        { period: '2025-09-30', epsEstimate: 1.1, epsActual: 1.05, surprisePercent: -4.55 },
        { period: '2025-12-31', epsEstimate: 1.2, epsActual: 1.31, surprisePercent: 9.17 },
      ],
    };

    it('hydrates the snapshot on init when the symbol has earnings data', () => {
      earnings.getForSymbol.mockReturnValue(of(populatedSnapshot));
      fixture.detectChanges();

      expect(earnings.getForSymbol).toHaveBeenCalledWith('AAPL');
      expect(component.earnings()).toEqual(populatedSnapshot);
      expect(component.earningsLoading()).toBe(false);
      expect(component.earningsError()).toBeNull();
      expect(component.earningsNotCovered()).toBe(false);
    });

    it('surfaces the no-data state on a 404', () => {
      // Default mock returns 404 — assert the empty-state flag flips and no error banner is set.
      // The dossier core stays untouched.
      fixture.detectChanges();

      expect(component.earningsNotCovered()).toBe(true);
      expect(component.earnings()).toBeNull();
      expect(component.earningsError()).toBeNull();
      expect(component.snapshot()).toEqual(EMPTY_SNAPSHOT);
    });

    it('surfaces a Finnhub 503 inline without breaking the rest of the dossier', () => {
      earnings.getForSymbol.mockReturnValue(throwError(() => ({ status: 503 })));
      fixture.detectChanges();

      // Inline error string set, dossier core untouched. Same rule as the news / analyst panels.
      expect(component.earningsError()).toContain('rateLimit');
      expect(component.earningsNotCovered()).toBe(false);
      expect(component.earnings()).toBeNull();
      expect(component.snapshot()).toEqual(EMPTY_SNAPSHOT);
    });

    it('surfaces the snapshot with no countdown when nextEarningsDate is null', () => {
      // The Finnhub /calendar/earnings endpoint sometimes 401s — the backend swallows that to a
      // null next-date. The front renders the report breakdown without the countdown line.
      const noCalendar: EarningsSnapshot = {
        ...populatedSnapshot,
        nextEarningsDate: null,
        nextEarningsTime: null,
      };
      earnings.getForSymbol.mockReturnValue(of(noCalendar));
      fixture.detectChanges();

      expect(component.earnings()).toEqual(noCalendar);
      expect(component.earningsCountdownDays()).toBeNull();
      expect(component.earningsNotCovered()).toBe(false);
    });

    it('earningsCountdownDays computes days from today to the next-earnings date', () => {
      // Pin the calculation : a date 5 days in the future returns 5, today returns 0, a past date
      // returns negative. The template uses these to pick the right i18n key (today / tomorrow /
      // inDays / daysAgo).
      const today = new Date();
      const future = new Date(today);
      future.setUTCDate(future.getUTCDate() + 5);
      const futureIso = future.toISOString().slice(0, 10);

      earnings.getForSymbol.mockReturnValue(
        of({ ...populatedSnapshot, nextEarningsDate: futureIso }),
      );
      fixture.detectChanges();

      expect(component.earningsCountdownDays()).toBe(5);
    });

    it('earningsSurpriseSign returns beat / miss / inline from the surprise %', () => {
      // Drives the chip colour. Pin the boundary : exactly 0 is `inline`, any positive is `beat`,
      // any negative is `miss`. A null surprise (e.g. when actual is missing) returns null so the
      // template hides the chip.
      expect(component.earningsSurpriseSign({ surprisePercent: 9.17 })).toBe('beat');
      expect(component.earningsSurpriseSign({ surprisePercent: -2.1 })).toBe('miss');
      expect(component.earningsSurpriseSign({ surprisePercent: 0 })).toBe('inline');
      expect(component.earningsSurpriseSign({ surprisePercent: null })).toBeNull();
    });

    it('earningsCountdownDays is null before the snapshot lands so the template can render unconditionally', () => {
      // Default mock returns 404 → snapshot stays null. Calling the getter at that moment must
      // not throw and must yield null — the template binds it under @if (earnings(); as e) so it
      // never sees a null computed in practice, but the contract is worth pinning.
      fixture.detectChanges();

      expect(component.earningsCountdownDays()).toBeNull();
    });

    it('earningsCountdownImminent flips true on dates within 7 days from today, inclusive', () => {
      // Pin the upper boundary : exactly 7 days out is still imminent (≤ inclusive).
      const today = new Date();
      const sevenDaysOut = new Date(today);
      sevenDaysOut.setUTCDate(sevenDaysOut.getUTCDate() + 7);
      const sevenDaysIso = sevenDaysOut.toISOString().slice(0, 10);

      earnings.getForSymbol.mockReturnValue(
        of({ ...populatedSnapshot, nextEarningsDate: sevenDaysIso }),
      );
      fixture.detectChanges();

      expect(component.earningsCountdownImminent()).toBe(true);
    });

    it('earningsCountdownImminent flips false on dates beyond 7 days from today', () => {
      // Pin the upper boundary : 8 days out is no longer imminent.
      const today = new Date();
      const eightDaysOut = new Date(today);
      eightDaysOut.setUTCDate(eightDaysOut.getUTCDate() + 8);
      const iso = eightDaysOut.toISOString().slice(0, 10);

      earnings.getForSymbol.mockReturnValue(of({ ...populatedSnapshot, nextEarningsDate: iso }));
      fixture.detectChanges();

      expect(component.earningsCountdownImminent()).toBe(false);
    });

    it('earningsCountdownImminent stays false on past dates so the chip does not light up retroactively', () => {
      // Bug we caught in review : Finnhub occasionally lists the just-reported quarter on the
      // morning of the print with `epsActual` still null for a few hours, which surfaces as a
      // -1 day countdown briefly. The pill must NOT light up warning-tinted in that case — a
      // past date isn't imminent. Pin the lower boundary explicitly.
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 3);
      const iso = yesterday.toISOString().slice(0, 10);

      earnings.getForSymbol.mockReturnValue(of({ ...populatedSnapshot, nextEarningsDate: iso }));
      fixture.detectChanges();

      expect(component.earningsCountdownImminent()).toBe(false);
    });

    it('earningsReportsNewestFirst flips the wire order so the most recent quarter sits on top', () => {
      // The backend emits oldest-first (matches the analyst trend convention). The earnings
      // table reads better newest-first because the user looks for "what just happened" first.
      // We pin the reverse explicitly so a refactor that swaps the wire order doesn't silently
      // change the table ordering.
      earnings.getForSymbol.mockReturnValue(of(populatedSnapshot));
      fixture.detectChanges();

      const reversed = component.earningsReportsNewestFirst();
      expect(reversed.map((r) => r.period)).toEqual([
        '2025-12-31',
        '2025-09-30',
        '2025-06-30',
        '2025-03-31',
      ]);
    });

    it('earningsReportsNewestFirst returns empty before the snapshot lands', () => {
      // Default mock = 404 → no snapshot. Helper must not throw and must yield an empty array
      // so the template can iterate it unconditionally.
      fixture.detectChanges();

      expect(component.earningsReportsNewestFirst()).toEqual([]);
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
