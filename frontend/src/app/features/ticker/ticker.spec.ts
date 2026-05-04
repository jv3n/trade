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
import { of, Subject, throwError } from 'rxjs';
import { TickerPage } from './ticker';
import {
  ChartResponse,
  MarketRepository,
  OhlcBar,
  TickerNarrativeJob,
  TickerNarrativeSnapshot,
  TickerSnapshot,
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
