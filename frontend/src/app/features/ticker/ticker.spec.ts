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
import { of } from 'rxjs';
import { TickerPage } from './ticker';
import { MarketRepository, TickerSnapshot } from '../../core/market.repository';

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

describe('TickerPage', () => {
  let component: TickerPage;
  let fixture: ComponentFixture<TickerPage>;
  let market: { getTicker: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    market = {
      getTicker: vi.fn().mockReturnValue(of(EMPTY_SNAPSHOT)),
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
});
