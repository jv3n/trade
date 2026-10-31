import { formatNumber } from '@angular/common';
import {
  Component,
  DOCUMENT,
  ElementRef,
  LOCALE_ID,
  computed,
  inject,
  input,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  CandleBar,
  CandleLine,
  CandleMark,
  CandleShade,
  StbButtonModule,
  StbButtonToggleModule,
  StbCandleChart,
  StbIconModule,
  StbTooltipModule,
} from '@portfolioai/ui';
import { fromEvent, map, of } from 'rxjs';
import { Pattern } from '../../../core/api/shared/pattern.model';
import { DayBar } from '../../../core/api/stats/day-chart.model';
import { StatsRepository } from '../../../core/api/stats/stats.repository';
import { pluralKey } from '../../../shared/plural/plural';

/** A point of the pattern, as typed in the panel — OPS for a GUS, BARES for a DT. */
export interface StatChartPoint {
  /** The point's name, the same word in French and English (`Push`, `Echo`…). */
  name: string;
  /** `HH:mm`, New York time ; the Open has its fixed 9:30 and passes none. */
  time: string | null;
  price: number | null;
  /** A high (Push, Apex, Echo) is labelled above its mark, a low under it. */
  above: boolean;
}

export type StatChartRange = 'day' | 'session';

const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
/** The day view's candle : 960 one-minute candles across a panel would be wicks only. */
const DAY_CANDLE = 5;
const CHART_HEIGHT = 320;
/** What the full-screen card keeps above and below its chart : the title, the switch, the notes. */
const FULLSCREEN_CHROME = 200;
/** A typed price this far outside its candle's low–high is off it — rounding stays on it. */
const OFF_TOLERANCE = 0.003;

const NEW_YORK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Minutes since midnight in New York — the clock the stats' times are typed in. */
function newYorkMinute(time: number): number {
  const [hours, minutes] = NEW_YORK.format(time).split(':').map(Number);
  return hours * 60 + minutes;
}

function label(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function minuteOf(time: string | null): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * The opening minute of the candle a point sits on. A typed time is the candle's **end**, as a chart
 * reads it and ts-scanner records it (#806) ; the Open is the 9:30 candle's own opening.
 */
function barMinuteOf(point: { name: string; minute: number }): number {
  return point.name === 'Open' ? point.minute : point.minute - 1;
}

interface MinuteBar extends DayBar {
  minute: number;
}

/** [bars] grouped by [size] minutes from midnight — open of the first, close of the last. */
function aggregate(bars: readonly MinuteBar[], size: number): CandleBar[] {
  const buckets = new Map<number, MinuteBar[]>();
  for (const bar of bars) {
    const start = Math.floor(bar.minute / size) * size;
    buckets.set(start, [...(buckets.get(start) ?? []), bar]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, group]) => ({
      label: label(start),
      open: group[0].open,
      close: group[group.length - 1].close,
      high: Math.max(...group.map((b) => b.high)),
      low: Math.min(...group.map((b) => b.low)),
      volume: group.reduce((sum, b) => sum + b.volume, 0),
    }));
}

/**
 * The day's chart of the stat in the panel (#784) : its 1-min bars, the pattern's points marked on
 * their candles as they are typed, and a point off its candle in amber — a mistyped price or time
 * shows here. The bars come from ts-scanner : a stat of the day, or a new one, has none yet.
 */
@Component({
  selector: 'app-stat-chart',
  imports: [
    StbCandleChart,
    StbButtonModule,
    StbButtonToggleModule,
    StbIconModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './stat-chart.html',
  styleUrl: './stat-chart.scss',
})
export class StatChart {
  private readonly repo = inject(StatsRepository);
  private readonly translate = inject(TranslateService);
  private readonly locale = inject(LOCALE_ID);
  private readonly document = inject(DOCUMENT);
  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');

  /** Safari on an iPhone has no full screen for an element : no button there. */
  readonly canFullscreen = this.document.fullscreenEnabled;

  /** The card on the whole screen — the browser's full screen, left with the button or Échap. */
  readonly fullscreen = toSignal(
    fromEvent(this.document, 'fullscreenchange').pipe(
      map(() => this.document.fullscreenElement === this.card().nativeElement),
    ),
    { initialValue: false },
  );

  /** The chart's height : the panel's, or the screen's less the card's title and notes. */
  readonly chartHeight = computed(() =>
    this.fullscreen()
      ? Math.max(CHART_HEIGHT, window.innerHeight - FULLSCREEN_CHROME)
      : CHART_HEIGHT,
  );

  /** The stat in the panel — null while it is being created. */
  readonly statId = input.required<string | null>();
  readonly pattern = input.required<Pattern>();
  readonly points = input<readonly StatChartPoint[]>([]);
  readonly previousClose = input<number | null>(null);

  /** A GUS opens on the day — its premarket counts ; a DT on the session (#649). */
  readonly range = linkedSignal<StatChartRange>(() =>
    this.pattern() === 'DT' ? 'session' : 'day',
  );

  private readonly chartResource = rxResource({
    params: () => this.statId(),
    stream: ({ params: id }) => (id ? this.repo.dayChart(id) : of(null)),
  });

  readonly state = computed(() => {
    if (!this.statId()) return 'PENDING' as const;
    if (this.chartResource.status() === 'error') return 'UNAVAILABLE' as const;
    return this.chartResource.hasValue() ? (this.chartResource.value()?.state ?? null) : null;
  });

  readonly ticker = computed(() => this.chartResource.value()?.ticker ?? '');

  private readonly minuteBars = computed<MinuteBar[]>(() =>
    (this.chartResource.value()?.bars ?? []).map((b) => ({ ...b, minute: newYorkMinute(b.time) })),
  );

  private readonly byMinute = computed(
    () => new Map(this.minuteBars().map((b) => [b.minute, b] as const)),
  );

  readonly candles = computed<CandleBar[]>(() => {
    const bars = this.minuteBars();
    return this.range() === 'session'
      ? aggregate(
          bars.filter((b) => b.minute >= OPEN && b.minute < CLOSE),
          1,
        )
      : aggregate(bars, DAY_CANDLE);
  });

  /** The extended hours, shaded on the day view. */
  readonly shades = computed<CandleShade[]>(() => {
    if (this.range() === 'session') return [];
    const labels = this.candles().map((c) => c.label);
    const before = labels.filter((l) => (minuteOf(l) ?? 0) < OPEN);
    const after = labels.filter((l) => (minuteOf(l) ?? 0) >= CLOSE);
    return [before, after]
      .filter((side) => side.length > 0)
      .map((side) => ({ from: side[0], to: side[side.length - 1] }));
  });

  /** The typed points with a price and a time — the Open has its 9:30. */
  private readonly placed = computed(() =>
    this.points()
      .map((p) => ({ ...p, minute: p.name === 'Open' ? OPEN : minuteOf(p.time) }))
      .filter(
        (p): p is StatChartPoint & { minute: number; price: number } =>
          p.price !== null && p.minute !== null,
      ),
  );

  /** One precision for the whole scale : 4 decimals once it reaches under $1, else 2. */
  private readonly digits = computed(() => {
    const lows = [...this.candles().map((c) => c.low), ...this.placed().map((p) => p.price)];
    return lows.length > 0 && Math.min(...lows) < 1 ? '1.4-4' : '1.2-2';
  });

  readonly formatPrice = computed(() => {
    const digits = this.digits();
    return (value: number) => formatNumber(value, this.locale, digits);
  });

  private readonly offPoints = computed(() =>
    this.placed().flatMap((p) => {
      const bar = this.byMinute().get(barMinuteOf(p));
      if (!bar) return [];
      const above = p.price > bar.high * (1 + OFF_TOLERANCE);
      const below = p.price < bar.low * (1 - OFF_TOLERANCE);
      return above || below ? [{ point: p, bar, edge: above ? bar.high : bar.low }] : [];
    }),
  );

  readonly marks = computed<CandleMark[]>(() => {
    const labels = new Set(this.candles().map((c) => c.label));
    const size = this.range() === 'session' ? 1 : DAY_CANDLE;
    const off = new Map(this.offPoints().map((o) => [o.point.name, o.edge]));
    const format = this.formatPrice();
    return this.placed().flatMap((p) => {
      const at = label(Math.floor(barMinuteOf(p) / size) * size);
      if (!labels.has(at)) return [];
      const edge = off.get(p.name);
      return [
        {
          short: p.name[0],
          title: `${p.name} · ${label(p.minute)} · ${format(p.price)}`,
          at,
          price: p.price,
          tone: edge === undefined ? ('accent' as const) : ('warn' as const),
          above: p.above,
          // Off is judged on the 1-min candle : a 5-min one can hold the point and bury the leader.
          towards: size === 1 ? edge : undefined,
        },
      ];
    });
  });

  readonly line = computed<CandleLine | null>(() => {
    const close = this.previousClose();
    if (close === null || this.pattern() === 'DT' || this.range() === 'session') return null;
    return {
      price: close,
      label: this.translate.instant('stats.chart.previousClose', {
        price: this.formatPrice()(close),
      }),
    };
  });

  /** « Echo et Sink pas encore saisis » — the points to read off the candles. */
  readonly missing = computed(() => {
    const names = this.points()
      .filter((p) => p.price === null || (p.name !== 'Open' && minuteOf(p.time) === null))
      .map((p) => p.name);
    if (names.length === 0) return null;
    return this.translate.instant(pluralKey('stats.chart.missing', names.length, this.locale), {
      points: this.list(names),
    });
  });

  /** « Hors de sa bougie : Push 2,20 à 09:41, la bougie 1,99–2,02 — vérifie le prix ou l'heure. » */
  readonly off = computed(() => {
    const format = this.formatPrice();
    const lines = this.offPoints().map(({ point, bar }) =>
      this.translate.instant('stats.chart.offPoint', {
        name: point.name,
        price: format(point.price),
        time: label(point.minute),
        low: format(bar.low),
        high: format(bar.high),
      }),
    );
    return lines.length === 0
      ? null
      : this.translate.instant('stats.chart.off', { points: lines.join(' ; ') });
  });

  toggleFullscreen(): void {
    const request = this.fullscreen()
      ? this.document.exitFullscreen()
      : this.card().nativeElement.requestFullscreen();
    // A refusal leaves the card where it is, and is nothing to report (#814).
    request.catch(() => undefined);
  }

  private list(names: string[]): string {
    const and = this.translate.instant('stats.chart.and');
    return names.length > 1 ? `${names.slice(0, -1).join(', ')}${and}${names.at(-1)}` : names[0];
  }
}
