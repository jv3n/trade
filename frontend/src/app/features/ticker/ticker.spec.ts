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
import { of, Subject, throwError } from 'rxjs';
import { TickerPage } from './ticker';
import {
  MarketRepository,
  TickerNarrativeJob,
  TickerNarrativeSnapshot,
  TickerSnapshot,
} from '../../core/market.repository';

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
    requestNarrative: ReturnType<typeof vi.fn>;
    pollNarrativeJob: ReturnType<typeof vi.fn>;
    getLatestNarrative: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    market = {
      getTicker: vi.fn().mockReturnValue(of(EMPTY_SNAPSHOT)),
      requestNarrative: vi.fn(),
      pollNarrativeJob: vi.fn(),
      // Default : no narrative yet (first visit). Tests that need one override this.
      getLatestNarrative: vi.fn().mockReturnValue(of(null)),
    };

    await TestBed.configureTestingModule({
      imports: [TickerPage],
      providers: [
        { provide: MarketRepository, useValue: market },
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
