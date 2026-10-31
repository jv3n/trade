import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Pattern } from '../../../core/api/shared/pattern.model';
import { DayChart } from '../../../core/api/stats/day-chart.model';
import { StatsRepository } from '../../../core/api/stats/stats.repository';
import { StatChart, StatChartPoint } from './stat-chart';

/**
 * The day's chart of a stat (#784), as the panel feeds it :
 * - **a new stat, or a day not fetched yet, reads « tomorrow morning »** — a stat being created
 *   asks for no bars at all ; a day the provider served nothing for says so, with its ticker ;
 * - with bars, **a GUS opens on the day, a DT on the session** (#649) ;
 * - the chart goes **full screen** from the card's button, offered only when there is a chart ;
 * - **a typed point off its candle is named** — the mistyped price or time this chart is for — and
 *   the points not typed yet are listed, to be read off the candles.
 */
@Component({
  imports: [StatChart],
  template: `<app-stat-chart
    [statId]="statId()"
    [pattern]="pattern()"
    [points]="points()"
    [previousClose]="0.62"
  />`,
})
class Host {
  readonly statId = signal<string | null>('stat-1');
  readonly pattern = signal<Pattern>('GUS');
  readonly points = signal<readonly StatChartPoint[]>([]);
}

/** jsdom has no `document.fullscreenEnabled`. */
function fullscreenEnabled(value: boolean): void {
  Object.defineProperty(document, 'fullscreenEnabled', { value, configurable: true });
}

/** OLOX 21/10 around the open, in UTC (13:30 is the New York open) — one bar a minute. */
const BARS = [
  {
    time: Date.UTC(2026, 9, 21, 12, 0),
    open: 0.9,
    high: 0.92,
    low: 0.89,
    close: 0.91,
    volume: 8_000,
  },
  {
    time: Date.UTC(2026, 9, 21, 13, 30),
    open: 1.1,
    high: 1.14,
    low: 1.02,
    close: 1.04,
    volume: 182_340,
  },
  {
    time: Date.UTC(2026, 9, 21, 13, 31),
    open: 1.04,
    high: 1.2,
    low: 1.03,
    close: 1.18,
    volume: 96_015,
  },
];

function chart(overrides: Partial<DayChart> = {}): DayChart {
  return { ticker: 'OLOX', state: 'FOUND', bars: BARS, ...overrides };
}

describe('StatChart', () => {
  let dayChart: ReturnType<typeof vi.fn<(id: string) => Observable<DayChart>>>;

  beforeEach(() => {
    dayChart = vi.fn(() => of(chart()));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        { provide: StatsRepository, useValue: { dayChart } as unknown as StatsRepository },
      ],
    });
    TestBed.inject(TranslateService).setTranslation('en', {
      stats: {
        chart: {
          and: ' and ',
          missingOne: '{{points}} not typed yet',
          missing: '{{points}} not typed yet',
          off: 'Off its candle : {{points}}',
          offPoint: '{{name}} {{price}} at {{time}}',
          leg: '{{from}} → {{to}} · {{move}}% · {{minutes}} min',
        },
      },
    });
  });

  async function render(setup?: (host: Host) => void) {
    const fixture = TestBed.createComponent(Host);
    setup?.(fixture.componentInstance);
    await fixture.whenStable();
    const view = fixture.debugElement.children[0].componentInstance as StatChart;
    return { fixture, view, el: fixture.nativeElement as HTMLElement };
  }

  it('reads « tomorrow morning » for a stat being created, without asking for bars', async () => {
    const { el } = await render((h) => h.statId.set(null));

    expect(el.querySelector('[data-testid="chart-pending"]')).not.toBeNull();
    expect(dayChart).not.toHaveBeenCalled();
  });

  it('reads « tomorrow morning » for a day the scanner has not fetched yet', async () => {
    dayChart.mockReturnValue(of(chart({ state: 'PENDING', bars: [] })));

    const { el } = await render();

    expect(el.querySelector('[data-testid="chart-pending"]')).not.toBeNull();
  });

  it('says no bars were served for the day', async () => {
    dayChart.mockReturnValue(of(chart({ state: 'NOT_FOUND', bars: [] })));

    const { el } = await render();

    expect(el.querySelector('[data-testid="chart-not-found"]')).not.toBeNull();
  });

  it('opens a GUS on the whole day, its premarket in 5-min candles', async () => {
    const { el, view } = await render();

    expect(el.querySelector('ui-candle-chart')).not.toBeNull();
    expect(view.range()).toBe('day');
    expect(view.candles().map((c) => c.label)).toEqual(['08:00', '09:30']);
  });

  it('opens a double top on the session, one candle a minute', async () => {
    const { view } = await render((h) => h.pattern.set('DT'));

    expect(view.range()).toBe('session');
    expect(view.candles().map((c) => c.label)).toEqual(['09:30', '09:31']);
  });

  it('names a typed point off its candle — the Push typed at 2.20 on a 1.20 top', async () => {
    const { el, view } = await render((h) =>
      h.points.set([
        { name: 'Open', time: null, price: 1.1, above: false },
        { name: 'Push', time: '09:31', price: 2.2, above: true },
      ]),
    );

    expect(view.marks().find((m) => m.short === 'P')?.tone).toBe('warn');
    expect(view.marks().find((m) => m.short === 'O')?.tone).toBe('accent');
    expect(el.querySelector('[data-testid="chart-off"]')?.textContent).toContain('Push');
  });

  it('draws the leader of an off point on the session only — a 5-min candle would bury it', async () => {
    const points: StatChartPoint[] = [{ name: 'Push', time: '09:32', price: 2.2, above: true }];
    const { view } = await render((h) => h.points.set(points));

    expect(view.marks()[0].towards).toBeUndefined();
    view.range.set('session');
    expect(view.marks()[0].towards).toBe(1.2);
  });

  // Staging, POM 21/10 : every scanner point sat one candle to the right, all of them amber.
  it('reads a typed time as the end of its candle — 09:32 is the top of the 09:31 candle', async () => {
    const { view } = await render((h) => {
      h.pattern.set('DT');
      h.points.set([{ name: 'Apex', time: '09:32', price: 1.2, above: true }]);
    });

    expect(view.marks()[0]).toMatchObject({ at: '09:31', tone: 'accent' });
    expect(view.marks()[0].title).toContain('09:32');
  });

  it('keeps the Open on the 9:30 candle, the opening of its own candle', async () => {
    const { view } = await render((h) => {
      h.pattern.set('DT');
      h.points.set([{ name: 'Open', time: null, price: 1.1, above: false }]);
    });

    expect(view.marks()[0]).toMatchObject({ at: '09:30', tone: 'accent' });
  });

  it('puts 09:35 on the 5-min candle ending at it, not the one it starts', async () => {
    const { view } = await render((h) =>
      h.points.set([{ name: 'Push', time: '09:35', price: 1.2, above: true }]),
    );

    expect(view.marks()[0].at).toBe('09:30');
  });

  it('puts the card on the whole screen from its button', async () => {
    fullscreenEnabled(true);
    const { el } = await render();
    const card = el.querySelector('.stat-chart') as HTMLElement;
    const requestFullscreen = vi.fn(() => Promise.resolve());
    card.requestFullscreen = requestFullscreen;

    (el.querySelector('[data-testid="chart-fullscreen"]') as HTMLButtonElement).click();

    expect(requestFullscreen).toHaveBeenCalled();
  });

  // Staging : `TypeError: not granted`, uncaught, one GlitchTip report per click.
  it('leaves the card in place when the browser refuses the full screen', async () => {
    fullscreenEnabled(true);
    const { el, fixture, view } = await render();
    const card = el.querySelector('.stat-chart') as HTMLElement;
    const refusal = Promise.reject(new TypeError('not granted'));
    const handled = vi.spyOn(refusal, 'catch');
    card.requestFullscreen = vi.fn(() => refusal);

    (el.querySelector('[data-testid="chart-fullscreen"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    // The state alone would hold without the `catch` : it is the rejection that must not escape.
    expect(handled).toHaveBeenCalled();
    expect(view.fullscreen()).toBe(false);
  });

  it('offers no full screen while there is no chart', async () => {
    fullscreenEnabled(true);
    dayChart.mockReturnValue(of(chart({ state: 'PENDING', bars: [] })));

    const { el } = await render();

    expect(el.querySelector('[data-testid="chart-fullscreen"]')).toBeNull();
  });

  // Safari on an iPhone : a click would throw, `requestFullscreen` does not exist on the card.
  it('offers no full screen where the browser has none', async () => {
    fullscreenEnabled(false);

    const { el } = await render();

    expect(el.querySelector('[data-testid="chart-fullscreen"]')).toBeNull();
  });

  // ---- Legs (#818) ----

  it('joins the typed points in time order, its move read from the first', async () => {
    const { view } = await render((h) =>
      h.points.set([
        { name: 'Push', time: '09:32', price: 1.2, above: true },
        { name: 'Open', time: null, price: 1.1, above: false },
      ]),
    );

    view.range.set('session');

    expect(view.legs()).toEqual([
      {
        title: 'Open → Push · +9.1% · 2 min',
        from: { at: '09:30', price: 1.1 },
        to: { at: '09:31', price: 1.2 },
        tone: 'accent',
      },
    ]);
  });

  it('skips a point not typed : the leg joins the two around it', async () => {
    const { view } = await render((h) => {
      h.pattern.set('DT');
      h.points.set([
        { name: 'Base', time: '09:31', price: 1.1, above: false },
        { name: 'Apex', time: null, price: null, above: true },
        { name: 'Rejection', time: '09:32', price: 1.04, above: false },
      ]);
    });

    expect(view.legs()).toHaveLength(1);
    expect(view.legs()[0].title).toBe('Base → Rejection · −5.5% · 1 min');
  });

  it('turns a leg amber when one of its points is off its candle', async () => {
    const { view } = await render((h) =>
      h.points.set([
        { name: 'Open', time: null, price: 1.1, above: false },
        { name: 'Push', time: '09:31', price: 2.2, above: true },
      ]),
    );

    expect(view.legs()[0].tone).toBe('warn');
  });

  it('draws no leg whose end the view does not show', async () => {
    const { view } = await render((h) => {
      h.pattern.set('DT');
      h.points.set([
        { name: 'Base', time: '08:03', price: 1.1, above: false },
        { name: 'Apex', time: '09:32', price: 1.2, above: true },
      ]);
    });

    expect(view.legs()).toEqual([]);
  });

  it('lists the points not typed yet, to read off the candles', async () => {
    const { el } = await render((h) =>
      h.points.set([
        { name: 'Open', time: null, price: 1.1, above: false },
        { name: 'Push', time: null, price: null, above: true },
        { name: 'Sink', time: null, price: null, above: false },
      ]),
    );

    expect(el.querySelector('[data-testid="chart-missing"]')?.textContent?.trim()).toBe(
      'Push and Sink not typed yet',
    );
  });
});
