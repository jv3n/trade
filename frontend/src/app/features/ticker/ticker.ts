import { Component, computed, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  Subscription,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  of,
  switchMap,
} from 'rxjs';
import { LanguageService } from '../../core/language.service';
import {
  MarketRepository,
  OhlcBar,
  SymbolMatch,
  TickerNarrativeSnapshot,
  TickerSnapshot,
  TIMEFRAME_CODES,
  TimeframeCode,
} from '../../core/market.repository';
import { NewsItem, NewsRepository } from '../../core/news.repository';
import { WatchlistRepository } from '../../core/watchlist.repository';
import { Annotation, AnnotationRepository } from '../../core/annotation.repository';
import { AnalystRepository, AnalystSnapshot } from '../../core/analyst.repository';
import { EarningsRepository, EarningsSnapshot } from '../../core/earnings.repository';

/**
 * Same value as the dashboard watchlist autocomplete — keeps the typing-vs-search rhythm uniform
 * across the app.
 */
const BENCHMARK_SEARCH_DEBOUNCE_MS = 300;

interface ChartPoint {
  x: number;
  y: number;
  bar: OhlcBar;
}

interface YTick {
  y: number;
  label: string;
}

interface XTick {
  x: number;
  label: string;
}

interface ChartGeometry {
  /** Inner-area projected (x, y) for each bar in the *visible* range (sliced when zoomed), plus a
   *  reference back to the bar. */
  points: ChartPoint[];
  /** SVG path `d` attribute for the ticker polyline. */
  pricePath: string;
  /** SVG path `d` for the benchmark polyline — only present when benchmark is on AND its bars
   *  are loaded. Absent during the pre-load window so the chart still draws the ticker line. */
  benchmarkPath?: string;
  /** Projected benchmark points (one per aligned bar) — used to draw the benchmark hover dot. */
  benchmarkPoints?: ChartPoint[];
  /** Horizontal grid + axis labels (price in single-series mode, % return when benchmark is on). */
  yTicks: YTick[];
  /** Vertical reference points + date labels on the bottom axis. */
  xTicks: XTick[];
  /** Inner drawing area (excluding axis margins) — used by the crosshair. */
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  /** Active series-based overlays (MA50/MA200/Bollinger bands). Empty in benchmark mode — the
   *  Y axis is then in % return space and price-level overlays don't make sense. */
  overlayPaths: OverlayPath[];
  /** Active horizontal-line overlays (52w hi/lo). Empty in benchmark mode for the same reason. */
  overlayHLines: OverlayHLine[];
  /** Y axis domain — exposed so the click-on-chart handler can convert a screen Y back to a
   *  price level when adding a horizontal annotation. In benchmark % mode we still expose the
   *  values, but `addAnnotation` short-circuits because annotations are price-anchored. */
  yMin: number;
  yRange: number;
  /** Chart annotations laid out for the current geometry. Empty in benchmark mode (their price
   *  levels don't share the % return Y axis) and clamped to the chart edges when the price falls
   *  outside the visible window — the label gets a "↑" / "↓" suffix to flag the clamp. */
  annotations: RenderableAnnotation[];
}

interface HoverInfo {
  /** Index into `chartBars()` of the bar nearest to the cursor. */
  index: number;
  /** Inner-area X (used by the SVG crosshair). */
  x: number;
  /** Inner-area Y of the bar's close (anchors the ticker dot marker). */
  y: number;
  /** Inner-area Y of the benchmark's close at the same index, or null when benchmark is off /
   *  not loaded / the index falls outside the benchmark series. */
  benchmarkY: number | null;
  /** Localized date / time label for the tooltip. */
  timeLabel: string;
  /** Pre-formatted ticker label — price + currency when benchmark is off, signed % otherwise. */
  priceLabel: string;
  /** Pre-formatted benchmark label (signed %), or null when benchmark is off / not loaded. */
  benchmarkLabel: string | null;
  /** Tooltip horizontal position as a percentage of the chart canvas — used by CSS. */
  percentX: number;
  /** Pre-formatted delta % from the [measureAnchor] to the hovered bar (signed), or null when
   *  no anchor is set / benchmark mode active / anchor's bar fell out of the visible range. */
  deltaPercent: string | null;
  /** Pre-formatted delta time from the anchor to the hovered bar (e.g. "+12 j", "-3 h"). */
  deltaTime: string | null;
}

/**
 * Benchmark picker values. `'off'` is the sentinel for "no overlay" ; the four buttons in the
 * toolbar are `off | SPY | QQQ | IWM | sector`. `'custom'` is set internally when the user picks
 * a ticker from the autocomplete sidecar — there's no Custom *button* in the toggle group, the
 * toggle simply deselects when the user picks via the autocomplete.
 *
 * Using a string sentinel rather than `null` keeps `mat-button-toggle-group` happy (it doesn't
 * bind cleanly to nullable values).
 */
export type BenchmarkChoice = 'off' | 'SPY' | 'QQQ' | 'IWM' | 'sector' | 'custom';

/** Toggle-group buttons in display order — `'custom'` is excluded (set via the autocomplete only). */
export const BENCHMARK_TOGGLE_CHOICES: BenchmarkChoice[] = ['off', 'SPY', 'QQQ', 'IWM', 'sector'];

/** What's actually plotted under the ticker line. `null` means no overlay (mode `'off'` or
 *  `'custom'` waiting for a pick or `'sector'` waiting for the resolve). */
interface ResolvedBenchmark {
  /** Symbol passed to `getChart` to fetch the bars (e.g. `SPY`, `XLK`, `MSFT`). */
  symbol: string;
  /** Display label for the chart legend / tooltip (e.g. `SPY`, `Technology (XLK)`, `MSFT`). */
  label: string;
}

/** Inclusive bar-index range stored when the chart is zoomed in. Indices are into the full
 *  [chartBars] array — the sliced view is recomputed downstream by [chartGeometry]. */
interface ZoomRange {
  startIdx: number;
  endIdx: number;
}

/** Active drag-to-zoom selection in inner-area X coordinates. `null` = no drag in flight. */
interface DragSelection {
  startX: number;
  currentX: number;
}

/** Below this drag distance (px in SVG user units) we treat a pointerdown→up sequence as a click,
 *  not a zoom gesture. Avoids accidental zoom on a click that ended a few pixels away from start. */
const ZOOM_DRAG_THRESHOLD_PX = 10;

/** Available chart overlays. Names mirror the IndicatorCalculator periods (MA50/MA200) for the
 *  series-based overlays ; `hi52w` / `lo52w` reuse the dossier's 52w high/low quote ; `boll` is
 *  Bollinger bands (20-period MA ± 2σ) computed front-side from [chartBars]. */
export type OverlayKind = 'ma50' | 'ma200' | 'hi52w' | 'lo52w' | 'boll';
export const OVERLAY_KINDS: OverlayKind[] = ['ma50', 'ma200', 'boll', 'hi52w', 'lo52w'];

/** Per-series polyline overlay rendered above the price line. Bollinger bands break into 3 paths
 *  (upper / middle / lower) so each band carries its own SVG class for theming. */
interface OverlayPath {
  kind: 'ma50' | 'ma200' | 'boll-upper' | 'boll-middle' | 'boll-lower';
  d: string;
}

/** Horizontal-line overlay (52w hi/lo) rendered as a single dashed line + price label. */
interface OverlayHLine {
  kind: 'hi52w' | 'lo52w';
  y: number;
  label: string;
}

/** Inner-area rectangle for the SVG zoom selection (semi-transparent overlay during drag). */
interface ZoomSelectionRect {
  x: number;
  width: number;
  top: number;
  bottom: number;
}

/** Reference anchor placed by a single click (no drag) on the chart. The hover tooltip then
 *  displays delta % and delta time between the anchor bar and the bar under the cursor. */
interface MeasureAnchor {
  /** Index into the *visible* (sliced) `geom.points` array — naturally invalidated on a
   *  timeframe switch (which clears the anchor) ; preserved across zoom changes by re-deriving
   *  it from the bar timestamp on the next geometry pass. */
  index: number;
  /** Snapshot of the anchored bar's close — used for the % computation and as a unique key
   *  to recover the index after a zoom slice changes the geometry. */
  price: number;
  /** ISO timestamp of the anchored bar — used to recover the index across zoom changes
   *  (indices shift when slicing, but timestamps are stable). */
  timestamp: string;
}

/** Renderable annotation enriched with its on-screen Y coordinate for the current geometry. */
interface RenderableAnnotation extends Annotation {
  /** Inner-area Y at the annotation's price level — reread by the SVG `<line>`. */
  y: number;
  /** True when the annotation's price falls outside the visible Y window (clamped to the chart
   *  edge so it doesn't disappear). The label gets a "↑" / "↓" suffix to flag the clamp. */
  clamped: 'top' | 'bottom' | null;
}

/** Brush mode the pointer is in while dragging the bottom mini-chart's selector. The user picks
 *  the mode by where they grab the rectangle (left handle / body / right handle) ; clicking
 *  outside the rectangle resets the zoom. */
type BrushDragKind = 'pan' | 'resize-left' | 'resize-right';

/** Active drag in the brush mini-chart. Recorded between pointerdown and pointerup. */
interface BrushDrag {
  kind: BrushDragKind;
  /** Inner-area X where the drag started (in brush coordinates). */
  startX: number;
  /** Snapshot of the zoom range at drag start — pan/resize compute deltas from this. */
  initialRange: { startIdx: number; endIdx: number };
}

/** Vertical layout of the brush mini-chart inside the same SVG as the main chart. */
interface BrushGeometry {
  /** SVG path `d` for the compressed full-series price line. */
  pricePath: string;
  /** Top-left corner of the brush selector rectangle (zoom indicator). */
  rectX: number;
  rectWidth: number;
  rectTop: number;
  rectBottom: number;
  /** Inner drawing area of the brush row. */
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  /** Pixel width inside which the resize handles register (each side). Generous so they're
   *  comfortable to grab without over-narrowing the pan zone. */
  handleWidth: number;
}

/** Width (in SVG user units) of the resize-handle hit-zone on each side of the brush rectangle. */
const BRUSH_HANDLE_WIDTH_PX = 8;

/** Minimum drift (in bullish-minus-bearish fraction) between the oldest and newest analyst history
 *  snapshots before the trend arrow flips off "flat". Below this we consider the recommendations
 *  stable enough to not editorialise. ~5 % matches one analyst moving across the buy/hold line on
 *  a panel of 20. */
const TREND_EPSILON = 0.05;
/** Pre-computed milliseconds in a day — used to derive the countdown label on the earnings sub-
 *  block. */
const EARNINGS_MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Minimum width (in bar count) of the brush rectangle — prevents the user from collapsing it
 *  to zero by dragging the handles past each other. */
const BRUSH_MIN_BARS = 2;

@Component({
  selector: 'app-ticker',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './ticker.html',
  styleUrl: './ticker.scss',
})
export class TickerPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly marketRepository = inject(MarketRepository);
  private readonly newsRepository = inject(NewsRepository);
  private readonly watchlistRepository = inject(WatchlistRepository);
  private readonly annotationRepository = inject(AnnotationRepository);
  private readonly analystRepository = inject(AnalystRepository);
  private readonly earningsRepository = inject(EarningsRepository);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  symbol = signal<string>('');
  loading = signal(false);
  error = signal<string | null>(null);
  snapshot = signal<TickerSnapshot | null>(null);

  // ---- Chart state (multi-timeframe) ----

  /** All available toggle buttons — kept here so the template doesn't hard-code the order. */
  readonly timeframes = TIMEFRAME_CODES;
  /** Selected timeframe ; default `1y` matches the dossier's reference view. */
  selectedTimeframe = signal<TimeframeCode>('1y');
  /** Bars currently drawn on the chart. Kept separate from `snapshot.bars` so a timeframe
   *  switch can re-fetch bars without disturbing indicators / narrative. */
  chartBars = signal<OhlcBar[]>([]);
  chartLoading = signal(false);
  chartError = signal<string | null>(null);
  private chartSub?: Subscription;

  /** Bar index nearest the cursor when hovering the chart, or null when not hovering. */
  private hoveredIndex = signal<number | null>(null);

  // ---- Benchmark overlay state ----

  /** Toggle-group buttons (excludes `'custom'`, which is set via the autocomplete sidecar). */
  readonly benchmarkToggleChoices = BENCHMARK_TOGGLE_CHOICES;
  /** Active picker mode. Drives the toggle group selection and tells [chartGeometry] whether to
   *  flip the Y axis to percent. `'custom'` is set when the user picks via the autocomplete. */
  selectedBenchmark = signal<BenchmarkChoice>('off');
  /** What's actually plotted under the ticker line. `null` while resolving (sector) or waiting
   *  for the user to pick (custom). The chart geometry uses this to decide whether to draw the
   *  benchmark polyline ; the legend reads [label] from here. */
  resolvedBenchmark = signal<ResolvedBenchmark | null>(null);
  /** Bars for [resolvedBenchmark], aligned by index to [chartBars] (no date matching v1 — relies
   *  on US-listed benchmarks following the same trading calendar as US-listed tickers). */
  benchmarkBars = signal<OhlcBar[]>([]);
  benchmarkLoading = signal(false);
  /** Inline error scoped to the benchmark — a 503 here must NOT clear the main chart. */
  benchmarkError = signal<string | null>(null);
  private benchmarkSub?: Subscription;
  private sectorResolveSub?: Subscription;

  /**
   * Custom-benchmark autocomplete control. Mirrors the dashboard watchlist autocomplete shape :
   * `string | SymbolMatch | null` — flips between the typed string and a picked `SymbolMatch`.
   */
  customBenchmarkControl = new FormControl<string | SymbolMatch | null>('');
  /** Suggestions currently displayed in the autocomplete dropdown. */
  customBenchmarkSuggestions = signal<SymbolMatch[]>([]);
  /** True while the search HTTP call is in flight ; drives the dropdown spinner. */
  customBenchmarkSearching = signal(false);

  // ---- Chart zoom (v1) ----

  /** Active zoom range as full-array indices, `null` when the chart shows the entire timeframe.
   *  A drag-select on the SVG sets this ; [resetZoom] clears it ; [selectTimeframe] also clears
   *  it because indices don't translate across different bar sets. */
  zoomRange = signal<ZoomRange | null>(null);
  /** In-flight drag-select. Non-null only between pointerdown and pointerup ; rendered as a
   *  semi-transparent rectangle in the SVG and read by [zoomSelectionRect]. */
  private dragSelection = signal<DragSelection | null>(null);

  // ---- Chart overlays (v2) ----

  /** Set of overlays currently rendered on the chart. Multi-select via the toolbar toggle group ;
   *  empty by default to keep the chart clean. Disabled (visually + render-side) when benchmark
   *  mode is active — the Y axis is in % return space, MA / Bollinger / 52w levels in price space
   *  don't share a coordinate system. */
  overlayActive = signal<Set<OverlayKind>>(new Set());
  /** Array view of [overlayActive], for [value] binding on the multi-select toggle group. */
  overlayActiveArray = computed(() => Array.from(this.overlayActive()));
  /** Display order in the toolbar — exported as [overlayKinds] for the template. */
  readonly overlayKinds = OVERLAY_KINDS;

  // ---- Annotations + measure tools (v3) ----

  /** Persisted annotations for the current symbol, hydrated from [AnnotationRepository] on init.
   *  v3 only stores horizontal price lines ; the geometry maps each to a Y coordinate and clamps
   *  to the visible window so an out-of-range price still hugs the chart edge. */
  annotations = signal<Annotation[]>([]);
  /** True when the user has armed the "+ annotation" toolbar button — the next click on the
   *  chart (sub-threshold drag) creates a horizontal line at the clicked price. The flag flips
   *  back to false after a successful placement so the user opts in once per annotation. */
  annotationMode = signal(false);
  /** Anchor placed by a single click (no drag). When set, the hover tooltip shows delta % and
   *  delta time from the anchor to the hovered bar. Cleared on timeframe change (the timestamp
   *  may not exist in the new bar set) and on `resetZoom` for a tidy reset gesture. */
  measureAnchor = signal<MeasureAnchor | null>(null);

  // ---- Brush mini-chart (v3) ----

  /** Bottom mini-chart that mirrors the full series and shows the current zoom range as a
   *  draggable rectangle. State is purely derived from [chartBars] + [zoomRange] (no separate
   *  signal) ; only the in-flight drag is tracked here. */
  private brushDrag = signal<BrushDrag | null>(null);

  // ---- News state ----

  /** Headlines for the current ticker. Empty list = "no recent news" rather than "loading". */
  news = signal<NewsItem[]>([]);
  newsLoading = signal(false);
  /** Inline error in the news panel — kept scoped so a Finnhub hiccup doesn't blank the dossier. */
  newsError = signal<string | null>(null);

  // ---- Fundamentals — analyst recommendations state ----

  /** Analyst snapshot for the current ticker. `null` covers three states distinguished by the
   *  loading / coverage / error signals below : pending fetch, no coverage (404), or upstream
   *  error (503). */
  analyst = signal<AnalystSnapshot | null>(null);
  analystLoading = signal(false);
  /** True when the backend returned 404 — the symbol has no analyst coverage. Distinct from an
   *  error : the panel renders an empty-state line rather than a banner. */
  analystNotCovered = signal(false);
  /** Inline error scoped to the analyst panel — Finnhub hiccup doesn't blank the dossier. */
  analystError = signal<string | null>(null);

  // ---- Fundamentals — earnings state ----

  /** Earnings snapshot for the current ticker. `null` covers three states distinguished by the
   *  loading / coverage / error signals below : pending fetch, no data (404), or upstream error
   *  (503). */
  earnings = signal<EarningsSnapshot | null>(null);
  earningsLoading = signal(false);
  /** True when the backend returned 404 — the symbol has no earnings data. Distinct from an
   *  error : the panel renders an empty-state line rather than a banner. */
  earningsNotCovered = signal(false);
  /** Inline error scoped to the earnings panel — Finnhub hiccup doesn't blank the dossier. */
  earningsError = signal<string | null>(null);

  // ---- Watchlist state ----

  /** True when the current symbol is on the user's watchlist. Optimistic — flips before the
   *  server confirms ; rolls back on error. Tooltip / icon are derived from this signal. */
  isWatched = signal(false);
  /** Disables the toggle button while a request is in flight, prevents rapid double-clicks
   *  triggering races between add and remove. */
  watchlistBusy = signal(false);

  // ---- Narrative state ----

  narrative = signal<TickerNarrativeSnapshot | null>(null);
  narrativeLoading = signal(false);
  narrativeError = signal<string | null>(null);
  private narrativePollSub?: Subscription;

  // ---- Chart geometry ----

  /** ViewBox of the SVG. Aspect is preserved (no `preserveAspectRatio=none`) so axis labels
   *  don't get stretched on wide containers. */
  readonly chartWidth = 800;
  readonly chartHeight = 260;
  /** Inner padding — leaves room on the left for price labels, on the bottom for date labels. */
  private readonly padLeft = 56;
  private readonly padRight = 12;
  private readonly padTop = 12;
  private readonly padBottom = 24;

  /** Brush mini-chart layout (v3). Lives in its own SVG below the main chart so the existing
   *  geometry math doesn't have to know about it. Width matches the main so the X axes align
   *  visually ; height is intentionally short (~50px) — it's a navigator, not a second chart. */
  readonly brushWidth = 800;
  readonly brushHeight = 52;
  private readonly brushPadTop = 4;
  private readonly brushPadBottom = 6;

  chartGeometry = computed<ChartGeometry | null>(() => {
    const fullBars = this.chartBars();
    if (fullBars.length < 2) return null;

    // Apply zoom by slicing both series symmetrically. Indices stored on [zoomRange] are into the
    // full array ; the rest of the geometry operates on [bars] (sliced) so the % baseline, axis
    // ticks and overlay computations all align on the visible window. A change of timeframe
    // resets the zoom (cf. [selectTimeframe]) — bars don't translate across different ranges.
    const zoom = this.zoomRange();
    const bars = zoom ? fullBars.slice(zoom.startIdx, zoom.endIdx + 1) : fullBars;
    if (bars.length < 2) return null;

    const innerLeft = this.padLeft;
    const innerRight = this.chartWidth - this.padRight;
    const innerTop = this.padTop;
    const innerBottom = this.chartHeight - this.padBottom;
    const innerW = innerRight - innerLeft;
    const innerH = innerBottom - innerTop;

    const xAt = (i: number) => innerLeft + (i / (bars.length - 1)) * innerW;

    // Benchmark mode flips the Y axis from absolute price to % return from the first close.
    // Without this the two series can't share an axis (SPY at $500 next to a small-cap at $15
    // would crush one curve into a flat line). The flip happens *as soon as a benchmark is
    // resolved* — for presets that's the click, for sector that's the API resolve, for custom
    // that's the autocomplete pick. The second line appears once the chart bars fetch resolves.
    const benchOn = this.resolvedBenchmark() !== null;
    const fullBenchBars = this.benchmarkBars();
    const benchBars = zoom ? fullBenchBars.slice(zoom.startIdx, zoom.endIdx + 1) : fullBenchBars;
    const benchLoaded = benchOn && benchBars.length >= 2;

    let yValues: number[];
    let benchValues: number[] | null = null;
    let formatYTick: (v: number) => string;

    if (benchOn) {
      const t0 = bars[0].close;
      yValues = bars.map((b) => ((b.close - t0) / t0) * 100);
      formatYTick = (pct) => this.formatPercent(pct);
      if (benchLoaded) {
        const b0 = benchBars[0].close;
        // Align by index — US-listed benchmarks share the trading calendar with US-listed
        // tickers, so bar counts match for any given (range, interval). For dual-listed or
        // foreign tickers (e.g. RY.TO) a small mismatch can occur ; we silently truncate to
        // the common length and accept the minor drift.
        const common = Math.min(bars.length, benchBars.length);
        benchValues = benchBars.slice(0, common).map((b) => ((b.close - b0) / b0) * 100);
      }
    } else {
      yValues = bars.map((b) => b.close);
      formatYTick = (price) => this.formatPrice(price);
    }

    // Overlays are computed in *price* space and only rendered when benchmark mode is off
    // (otherwise the Y axis is in %, mixing the two would mislead — see ChartGeometry comment).
    const overlays = this.overlayActive();
    let ma50Series: (number | null)[] | null = null;
    let ma200Series: (number | null)[] | null = null;
    let bollUpper: (number | null)[] | null = null;
    let bollMiddle: (number | null)[] | null = null;
    let bollLower: (number | null)[] | null = null;
    const snap = this.snapshot();
    const hi52w = snap?.quote.fiftyTwoWeekHigh ?? null;
    const lo52w = snap?.quote.fiftyTwoWeekLow ?? null;

    if (!benchOn) {
      // Overlays computed on the FULL series, then sliced to the visible window. Keeps "MA50"
      // semantically MA50-of-the-full-series even when the user is zoomed on 30 bars — otherwise
      // a 30-bar zoom would turn MA50 into 30 nulls and the line would vanish.
      const fullCloses = fullBars.map((b) => b.close);
      const sliceView = <T>(s: T[]): T[] => (zoom ? s.slice(zoom.startIdx, zoom.endIdx + 1) : s);
      if (overlays.has('ma50')) ma50Series = sliceView(this.rollingMean(fullCloses, 50));
      if (overlays.has('ma200')) ma200Series = sliceView(this.rollingMean(fullCloses, 200));
      if (overlays.has('boll')) {
        const boll = this.bollinger(fullCloses, 20, 2);
        bollUpper = sliceView(boll.upper);
        bollMiddle = sliceView(boll.middle);
        bollLower = sliceView(boll.lower);
      }
    }

    // Y range must cover every series rendered, including overlays — otherwise an MA200 sitting
    // above the price ceiling gets clipped at the top edge.
    const allValues: number[] = benchValues ? [...yValues, ...benchValues] : [...yValues];
    const pushDefined = (s: (number | null)[] | null) => {
      if (s) for (const v of s) if (v !== null) allValues.push(v);
    };
    pushDefined(ma50Series);
    pushDefined(ma200Series);
    pushDefined(bollUpper);
    pushDefined(bollLower);
    if (!benchOn && overlays.has('hi52w') && hi52w !== null) allValues.push(hi52w);
    if (!benchOn && overlays.has('lo52w') && lo52w !== null) allValues.push(lo52w);

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;

    const yAt = (v: number) => innerTop + (1 - (v - min) / range) * innerH;

    const points: ChartPoint[] = bars.map((b, i) => ({ x: xAt(i), y: yAt(yValues[i]), bar: b }));
    const pricePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');

    let benchmarkPoints: ChartPoint[] | undefined;
    let benchmarkPath: string | undefined;
    if (benchValues) {
      benchmarkPoints = benchValues.map((v, i) => ({
        x: xAt(i),
        y: yAt(v),
        bar: benchBars[i],
      }));
      benchmarkPath = benchmarkPoints
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(' ');
    }

    // Series-based overlays. `seriesPath` skips leading null cells (warmup window for MAs) by
    // restarting an `M` segment whenever the previous cell was null — keeps the polyline visually
    // gap-free while honoring "no value yet".
    const seriesPath = (series: (number | null)[]): string => {
      const parts: string[] = [];
      let started = false;
      for (let i = 0; i < series.length; i++) {
        const v = series[i];
        if (v === null) {
          started = false;
          continue;
        }
        const x = points[i].x.toFixed(2);
        const y = yAt(v).toFixed(2);
        parts.push(`${started ? 'L' : 'M'} ${x} ${y}`);
        started = true;
      }
      return parts.join(' ');
    };

    const overlayPaths: OverlayPath[] = [];
    if (ma50Series) overlayPaths.push({ kind: 'ma50', d: seriesPath(ma50Series) });
    if (ma200Series) overlayPaths.push({ kind: 'ma200', d: seriesPath(ma200Series) });
    if (bollUpper) overlayPaths.push({ kind: 'boll-upper', d: seriesPath(bollUpper) });
    if (bollMiddle) overlayPaths.push({ kind: 'boll-middle', d: seriesPath(bollMiddle) });
    if (bollLower) overlayPaths.push({ kind: 'boll-lower', d: seriesPath(bollLower) });

    const overlayHLines: OverlayHLine[] = [];
    if (!benchOn) {
      if (overlays.has('hi52w') && hi52w !== null) {
        overlayHLines.push({ kind: 'hi52w', y: yAt(hi52w), label: this.formatPrice(hi52w) });
      }
      if (overlays.has('lo52w') && lo52w !== null) {
        overlayHLines.push({ kind: 'lo52w', y: yAt(lo52w), label: this.formatPrice(lo52w) });
      }
    }

    // 5 evenly-spaced horizontal grid lines (4 intervals). Labels formatted with the same
    // precision as the dossier price so the magnitudes line up visually.
    const yTicks: YTick[] = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const v = min + (1 - t) * range; // top tick = max value (visually higher)
      return { y: innerTop + t * innerH, label: formatYTick(v) };
    });

    // 4 evenly-spaced date markers. Date format depends on the active timeframe — intraday
    // shows HH:mm, daily shows DD MMM, multi-year shows MMM YYYY.
    const xTicks: XTick[] = [0, 1, 2, 3].map((t) => {
      const i = Math.round((t / 3) * (bars.length - 1));
      const ts = new Date(bars[i].timestamp);
      return { x: xAt(i), label: this.formatTickDate(ts) };
    });

    // Annotations rendered only in price mode (v3). Each is a horizontal line at its stored
    // price level — clamped to [innerTop, innerBottom] when the price falls outside the visible
    // Y window so it doesn't disappear off-screen ; the label gets a "↑" / "↓" suffix to flag the
    // clamp so the user knows the line is approximate.
    const renderableAnnotations: RenderableAnnotation[] = benchOn
      ? []
      : this.annotations().map((a) => {
          const rawY = yAt(a.value);
          let y = rawY;
          let clamped: 'top' | 'bottom' | null = null;
          if (rawY < innerTop) {
            y = innerTop;
            clamped = 'top';
          } else if (rawY > innerBottom) {
            y = innerBottom;
            clamped = 'bottom';
          }
          return { ...a, y, clamped };
        });

    return {
      points,
      pricePath,
      benchmarkPath,
      benchmarkPoints,
      yTicks,
      xTicks,
      innerLeft,
      innerRight,
      innerTop,
      innerBottom,
      overlayPaths,
      overlayHLines,
      yMin: min,
      yRange: range,
      annotations: renderableAnnotations,
    };
  });

  /**
   * Bottom-row mini-chart geometry — operates on the FULL `chartBars()` (no slicing) so the
   * user always sees the complete series and can drag the selector to navigate. The selector
   * rectangle reflects the current `zoomRange()` (or covers the full width when not zoomed).
   *
   * Coordinates are in the same SVG user-units system as the main chart (viewBox shares width)
   * so the X offsets line up visually — left padding mirrors the main's price-label gutter.
   */
  brushGeometry = computed<BrushGeometry | null>(() => {
    const fullBars = this.chartBars();
    if (fullBars.length < 2) return null;

    const innerLeft = this.padLeft;
    const innerRight = this.brushWidth - this.padRight;
    const innerTop = this.brushPadTop;
    const innerBottom = this.brushHeight - this.brushPadBottom;
    const innerW = innerRight - innerLeft;
    const innerH = innerBottom - innerTop;

    const xAt = (i: number) => innerLeft + (i / (fullBars.length - 1)) * innerW;

    const closes = fullBars.map((b) => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const yAt = (v: number) => innerTop + (1 - (v - min) / range) * innerH;

    const pricePath = closes
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`)
      .join(' ');

    const zoom = this.zoomRange();
    const startIdx = zoom?.startIdx ?? 0;
    const endIdx = zoom?.endIdx ?? fullBars.length - 1;
    const rectX = xAt(startIdx);
    const rectWidth = xAt(endIdx) - rectX;

    return {
      pricePath,
      rectX,
      rectWidth,
      rectTop: innerTop,
      rectBottom: innerBottom,
      innerLeft,
      innerRight,
      innerTop,
      innerBottom,
      handleWidth: BRUSH_HANDLE_WIDTH_PX,
    };
  });

  /** Resolves the measure anchor to a screen point in the *current* geometry. Returns null when
   *  no anchor is set, the active mode is benchmark (% axis), or the anchored bar is outside
   *  the visible window (e.g. the user zoomed past it). The lookup is by timestamp — robust to
   *  slicing that shifts indices. */
  measureAnchorPoint = computed<ChartPoint | null>(() => {
    const anchor = this.measureAnchor();
    const geom = this.chartGeometry();
    if (!anchor || !geom || this.resolvedBenchmark()) return null;
    return geom.points.find((p) => p.bar.timestamp === anchor.timestamp) ?? null;
  });

  /** Inner-area rectangle for the live drag selection — null when no drag is in flight. Read by
   *  the SVG `<rect class="zoom-selection">` ; both endpoints are clamped to the inner drawing
   *  area so the rectangle never spills over the axis margins even if the cursor strays out. */
  zoomSelectionRect = computed<ZoomSelectionRect | null>(() => {
    const sel = this.dragSelection();
    const geom = this.chartGeometry();
    if (!sel || !geom) return null;
    const clamp = (v: number) => Math.max(geom.innerLeft, Math.min(geom.innerRight, v));
    const x1 = clamp(Math.min(sel.startX, sel.currentX));
    const x2 = clamp(Math.max(sel.startX, sel.currentX));
    return {
      x: x1,
      width: x2 - x1,
      top: geom.innerTop,
      bottom: geom.innerBottom,
    };
  });

  /** Backward-compat accessor — older specs and the empty-state branch read this. */
  pricePath = computed(() => this.chartGeometry()?.pricePath ?? '');

  hoverInfo = computed<HoverInfo | null>(() => {
    const idx = this.hoveredIndex();
    const geom = this.chartGeometry();
    if (idx === null || !geom) return null;
    const point = geom.points[idx];
    if (!point) return null;

    // Re-derive the % baselines from the geometry's first visible bar rather than the full series
    // — when zoomed, both lines should be re-baselined to the visible window so the comparison
    // stays meaningful inside the zoom range.
    const benchOn = this.resolvedBenchmark() !== null;

    let priceLabel: string;
    let benchmarkLabel: string | null = null;
    let benchmarkY: number | null = null;

    if (benchOn) {
      // In percent mode we show signed % at hover for both series — apples-to-apples comparison
      // is the whole point of turning the overlay on.
      const t0 = geom.points[0].bar.close;
      const tickerPct = ((point.bar.close - t0) / t0) * 100;
      priceLabel = this.formatPercent(tickerPct);
      const benchPoint = geom.benchmarkPoints?.[idx];
      if (benchPoint && geom.benchmarkPoints && geom.benchmarkPoints.length >= 2) {
        const b0 = geom.benchmarkPoints[0].bar.close;
        const benchPct = ((benchPoint.bar.close - b0) / b0) * 100;
        benchmarkLabel = this.formatPercent(benchPct);
        benchmarkY = benchPoint.y;
      }
    } else {
      const currency = this.snapshot()?.quote.currency ?? '';
      priceLabel = currency
        ? `${this.formatPrice(point.bar.close)} ${currency}`
        : this.formatPrice(point.bar.close);
    }

    // Measure tools (v3) — show delta % + delta time from anchor to hovered bar. Disabled in
    // benchmark mode (the % axis already shows distance-from-start, a second delta would just
    // confuse the reading). The anchor is recovered by timestamp match — robust across zoom
    // changes that shift indices, but invalidated naturally when the timestamp falls outside
    // the visible window (anchor was zoomed out of view → no delta until user zooms back).
    let deltaPercent: string | null = null;
    let deltaTime: string | null = null;
    const anchor = this.measureAnchor();
    if (anchor && !benchOn) {
      const anchorPoint = geom.points.find((p) => p.bar.timestamp === anchor.timestamp);
      if (anchorPoint && anchorPoint !== point) {
        const fromPrice = anchorPoint.bar.close;
        const toPrice = point.bar.close;
        const pct = ((toPrice - fromPrice) / fromPrice) * 100;
        deltaPercent = this.formatPercent(pct);
        const deltaMs =
          new Date(point.bar.timestamp).getTime() - new Date(anchor.timestamp).getTime();
        deltaTime = this.formatDeltaTime(deltaMs);
      }
    }

    return {
      index: idx,
      x: point.x,
      y: point.y,
      benchmarkY,
      timeLabel: this.formatHoverDate(new Date(point.bar.timestamp)),
      priceLabel,
      benchmarkLabel,
      percentX: ((point.x - geom.innerLeft) / (geom.innerRight - geom.innerLeft)) * 100,
      deltaPercent,
      deltaTime,
    };
  });

  // ---- Indicator helpers (used in template for color bands) ----

  rsiClass = computed(() => {
    const r = this.snapshot()?.indicators?.rsi14;
    if (r === null || r === undefined) return '';
    if (r >= 70) return 'warning';
    if (r <= 30) return 'warning';
    return '';
  });

  drawdownClass = computed(() => {
    const d = this.snapshot()?.indicators?.drawdownFrom52wHigh;
    if (d === null || d === undefined) return '';
    if (d <= -20) return 'danger';
    if (d >= -5) return 'success';
    return '';
  });

  perfClass(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    if (value > 0) return 'success';
    if (value < 0) return 'danger';
    return '';
  }

  signed(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
  }

  private errorMessage(err: { status?: number } | undefined, symbol: string): string {
    switch (err?.status) {
      case 404:
        return this.translate.instant('ticker.errors.notFound', { symbol });
      case 503:
        return this.translate.instant('ticker.errors.rateLimit');
      default:
        return this.translate.instant('ticker.errors.generic');
    }
  }

  // ---- Lifecycle ----

  ngOnInit(): void {
    const s = this.route.snapshot.paramMap.get('symbol');
    if (!s) {
      this.error.set(this.translate.instant('ticker.errors.missingSymbol'));
      return;
    }
    this.symbol.set(s);
    this.load(s);
    this.loadLatestNarrative(s);
    this.loadWatchlistState(s);
    this.loadNews(s);
    this.loadAnalyst(s);
    this.loadEarnings(s);
    this.loadAnnotations(s);
    this.wireCustomBenchmarkSearch();
  }

  ngOnDestroy(): void {
    this.chartSub?.unsubscribe();
    this.benchmarkSub?.unsubscribe();
    this.sectorResolveSub?.unsubscribe();
    this.narrativePollSub?.unsubscribe();
  }

  load(symbol: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.marketRepository.getTicker(symbol).subscribe({
      next: (snap) => {
        this.snapshot.set(snap);
        this.chartBars.set(snap.bars);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(this.errorMessage(err, symbol));
        this.loading.set(false);
      },
    });
  }

  // ---- Chart timeframe + hover ----

  /**
   * Fetches the bars for [tf] from the chart endpoint and updates the chart. No-op when [tf]
   * equals the currently selected timeframe (matches the way mat-button-toggle emits) — keeps the
   * chart from flashing on a re-click.
   */
  selectTimeframe(tf: TimeframeCode): void {
    if (tf === this.selectedTimeframe() && this.chartBars().length > 0) return;
    const sym = this.symbol();
    if (!sym) return;
    this.selectedTimeframe.set(tf);
    this.chartLoading.set(true);
    this.chartError.set(null);
    // Reset hover so the previous timeframe's tooltip doesn't linger over the new bars.
    this.hoveredIndex.set(null);
    // Reset zoom — bar indices don't translate across timeframes (1Y has 252 daily bars, 5D has
    // ~390 5-min bars), so the previous range is meaningless on the new data set.
    this.zoomRange.set(null);
    this.dragSelection.set(null);
    // Same logic for the measure anchor — its timestamp may not exist in the new bar set.
    this.measureAnchor.set(null);
    this.chartSub?.unsubscribe();
    this.chartSub = this.marketRepository.getChart(sym, tf).subscribe({
      next: (resp) => {
        this.chartBars.set(resp.bars);
        this.chartLoading.set(false);
      },
      error: (err: { status?: number }) => {
        this.chartError.set(this.errorMessage(err, sym));
        this.chartLoading.set(false);
      },
    });
    // Refetch the benchmark for the new timeframe so the two series stay in sync. Done in
    // parallel — a slow benchmark fetch must not delay the main chart. Uses [resolvedBenchmark]
    // so a sector overlay refetches the resolved ETF (XLK) rather than re-resolving from scratch,
    // and a custom overlay refetches the picked symbol.
    const resolved = this.resolvedBenchmark();
    if (resolved) {
      this.fetchBenchmarkBars(resolved.symbol, tf);
    }
  }

  // ---- Benchmark overlay ----

  /**
   * Toggle-group click handler. For `off` and the three preset indices, resolution is synchronous
   * (the symbol IS the picker value). For `sector`, we kick the `/sector-benchmark` resolve and
   * fetch the bars when it lands. `custom` is never set via the toggle group — the user picks via
   * the autocomplete sidecar, see [onCustomBenchmarkSelected].
   *
   * Re-clicking the active choice is a no-op so the toggle doesn't burn an extra `getChart` credit
   * on every click.
   */
  selectBenchmark(choice: BenchmarkChoice): void {
    if (choice === this.selectedBenchmark()) return;
    this.selectedBenchmark.set(choice);
    // Clear the autocomplete sidecar on any toggle change — a click on SPY shouldn't leave a stale
    // "MSFT" string lingering in the input.
    this.customBenchmarkControl.setValue('', { emitEvent: false });
    this.customBenchmarkSuggestions.set([]);
    // Drop hover so a stale tooltip from the previous benchmark doesn't linger over a bar that
    // may not have a matching benchmark point in the new series (different bar counts).
    this.hoveredIndex.set(null);

    this.benchmarkSub?.unsubscribe();
    this.sectorResolveSub?.unsubscribe();
    this.benchmarkError.set(null);

    if (choice === 'off') {
      this.resolvedBenchmark.set(null);
      this.benchmarkBars.set([]);
      this.benchmarkLoading.set(false);
      return;
    }

    if (choice === 'sector') {
      this.resolveSectorBenchmark();
      return;
    }

    // Preset index : SPY / QQQ / IWM. Resolved symbol = the choice itself.
    this.resolvedBenchmark.set({ symbol: choice, label: choice });
    this.benchmarkBars.set([]);
    this.fetchBenchmarkBars(choice, this.selectedTimeframe());
  }

  /**
   * Two-step Sector flow : (1) call `/sector-benchmark` to resolve the dossier ticker to its SPDR
   * sector ETF, then (2) fetch the chart bars for that ETF and plot. A 404 from the resolve means
   * the sector isn't in the SPDR mapping (or the ticker isn't in the mock seed) — surface a polite
   * inline message rather than a generic error so the user understands they can pick a preset
   * instead.
   */
  private resolveSectorBenchmark(): void {
    const sym = this.symbol();
    if (!sym) return;
    this.resolvedBenchmark.set(null);
    this.benchmarkBars.set([]);
    this.benchmarkLoading.set(true);
    this.sectorResolveSub?.unsubscribe();
    this.sectorResolveSub = this.marketRepository.getSectorBenchmark(sym).subscribe({
      next: (sb) => {
        this.resolvedBenchmark.set({
          symbol: sb.etfSymbol,
          label: `${sb.sector} (${sb.etfSymbol})`,
        });
        this.fetchBenchmarkBars(sb.etfSymbol, this.selectedTimeframe());
      },
      error: (err: { status?: number }) => {
        this.benchmarkError.set(
          this.translate.instant(
            err?.status === 404
              ? 'ticker.benchmark.errors.sectorNotMapped'
              : 'ticker.benchmark.errors.fetch',
          ),
        );
        this.benchmarkLoading.set(false);
      },
    });
  }

  /**
   * Fetches the chart bars for [symbol] at [tf]. Provider-agnostic — used for presets, sector
   * (after resolve) and custom benchmarks alike. On error we clear the bars so a stale curve from
   * the previous benchmark doesn't linger under a fresh error banner.
   */
  private fetchBenchmarkBars(symbol: string, tf: TimeframeCode): void {
    this.benchmarkLoading.set(true);
    this.benchmarkError.set(null);
    this.benchmarkSub?.unsubscribe();
    this.benchmarkSub = this.marketRepository.getChart(symbol, tf).subscribe({
      next: (resp) => {
        this.benchmarkBars.set(resp.bars);
        this.benchmarkLoading.set(false);
      },
      error: () => {
        this.benchmarkBars.set([]);
        this.benchmarkError.set(this.translate.instant('ticker.benchmark.errors.fetch'));
        this.benchmarkLoading.set(false);
      },
    });
  }

  // ---- Custom benchmark autocomplete ----

  /**
   * Mirrors the dashboard watchlist autocomplete wiring : debounce the typed string, search the
   * configured market provider, drop the dropdown silently on a 503 (search is best-effort, the
   * inline error is reserved for the actual chart fetch).
   *
   * The `filter(string)` upstream of debounce is essential — when the user picks a suggestion, the
   * control flips to a `SymbolMatch` object and we must NOT trigger another search with the
   * previously-typed string still buffered.
   */
  private wireCustomBenchmarkSearch(): void {
    this.customBenchmarkControl.valueChanges
      .pipe(
        filter((v): v is string => typeof v === 'string'),
        debounceTime(BENCHMARK_SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((typed) => {
          const trimmed = typed.trim();
          if (trimmed.length === 0) {
            this.customBenchmarkSuggestions.set([]);
            return of<SymbolMatch[]>([]);
          }
          this.customBenchmarkSearching.set(true);
          return this.marketRepository
            .searchSymbols(trimmed)
            .pipe(catchError(() => of<SymbolMatch[]>([])));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((suggestions) => {
        this.customBenchmarkSuggestions.set(suggestions);
        this.customBenchmarkSearching.set(false);
      });
  }

  /**
   * Called when the user picks an option in the custom-benchmark autocomplete. Switches the
   * picker mode to `'custom'` (which deselects the toggle group visually since `custom` isn't a
   * button), sets [resolvedBenchmark] to the picked symbol, fetches its bars.
   */
  onCustomBenchmarkSelected(event: MatAutocompleteSelectedEvent): void {
    const match = event.option.value as SymbolMatch;
    this.selectedBenchmark.set('custom');
    this.resolvedBenchmark.set({ symbol: match.symbol, label: match.symbol });
    this.benchmarkBars.set([]);
    this.benchmarkError.set(null);
    this.hoveredIndex.set(null);
    this.sectorResolveSub?.unsubscribe();
    this.fetchBenchmarkBars(match.symbol, this.selectedTimeframe());
  }

  /** `mat-autocomplete [displayWith]` formatter — same shape as the dashboard. */
  displayCustomBenchmark(value: SymbolMatch | string | null): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    return value.symbol;
  }

  /**
   * Updates [hoveredIndex] to point at the bar nearest the cursor. We map the screen-space mouse
   * X back to the SVG's user units via `getScreenCTM().inverse()` — that handles any responsive
   * width without bespoke math. Suspended while a drag-zoom is in flight (the selection rectangle
   * takes priority over the crosshair).
   */
  onChartMouseMove(event: MouseEvent): void {
    if (this.dragSelection() !== null) return;
    const geom = this.chartGeometry();
    if (!geom) return;
    const x = this.svgLocalX(event);
    if (x === null) return;
    const innerW = geom.innerRight - geom.innerLeft;
    const t = Math.max(0, Math.min(1, (x - geom.innerLeft) / innerW));
    // [points] reflects the *visible* (sliced) range when zoomed, so the index naturally aligns
    // with `geom.points[idx]` and `hoverInfo` doesn't need to translate back to full indices.
    const idx = Math.round(t * (geom.points.length - 1));
    this.hoveredIndex.set(idx);
  }

  onChartMouseLeave(): void {
    this.hoveredIndex.set(null);
  }

  // ---- Chart zoom (v1) — drag-select to zoom, double-click or button to reset ----

  /**
   * Pointerdown on the SVG starts a drag-zoom selection. We record the inner-area X of the
   * starting point ; subsequent pointermove updates extend the rectangle ; pointerup commits.
   * Pointer capture is acquired on the chart-canvas div so the drag survives even if the cursor
   * temporarily leaves the chart bounds — without this the selection would cancel mid-drag.
   *
   * Only respond to the primary button (left-click) ; right-click and middle-click stay untouched
   * to leave room for native browser behavior (context menu, scroll).
   */
  onChartPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    // Clicks on annotation delete handles must NOT start a drag — let their (click) handler
    // run unhindered. The handle's `pointer-events: auto` (default) means it fires its own
    // events alongside ours ; without this guard we'd zoom-drag the chart while the user
    // genuinely meant to remove an annotation.
    const eventTarget = event.target as Element | null;
    // Optional chain on `closest` itself — the fake-target shape used in tests doesn't carry
    // `closest`, and `?.` only guards against null/undefined, not missing methods.
    if (eventTarget?.closest?.('.annotation-delete')) return;

    const x = this.svgLocalX(event);
    if (x === null) return;
    this.dragSelection.set({ startX: x, currentX: x });
    this.hoveredIndex.set(null);
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
  }

  onChartPointerMove(event: PointerEvent): void {
    const sel = this.dragSelection();
    if (sel === null) {
      // No drag in progress : delegate to the existing hover crosshair logic.
      this.onChartMouseMove(event);
      return;
    }
    const x = this.svgLocalX(event);
    if (x === null) return;
    this.dragSelection.set({ startX: sel.startX, currentX: x });
  }

  /**
   * Pointerup commits the zoom if the drag distance exceeded the threshold. Below threshold we
   * treat it as a click and ignore — avoids accidental zoom on a mis-clicked drag of 2-3 px.
   * The selection's X coordinates are converted back to bar indices via the visible (sliced)
   * `points.length`, then translated back to full-array indices by adding the current zoom's
   * start offset (zoom-in-zoom).
   */
  onChartPointerUp(event: PointerEvent): void {
    const sel = this.dragSelection();
    if (!sel) return;
    this.dragSelection.set(null);

    const distance = Math.abs(sel.currentX - sel.startX);

    if (distance < ZOOM_DRAG_THRESHOLD_PX) {
      // Sub-threshold = click. Route to the right action :
      //  - annotation mode armed → place a horizontal line at the clicked Y (price level)
      //  - otherwise → set/replace the measure anchor at the clicked bar
      this.handleChartClick(sel.startX, event);
      return;
    }

    const geom = this.chartGeometry();
    if (!geom) return;
    const innerW = geom.innerRight - geom.innerLeft;
    const indexAt = (x: number) => {
      const t = Math.max(0, Math.min(1, (x - geom.innerLeft) / innerW));
      return Math.round(t * (geom.points.length - 1));
    };
    let i1 = indexAt(sel.startX);
    let i2 = indexAt(sel.currentX);
    if (i1 > i2) [i1, i2] = [i2, i1];
    // Need at least 2 bars in the new zoom range to draw a polyline.
    if (i2 - i1 < 1) return;

    // Translate sliced indices back to full-array indices for nested zooming.
    const offset = this.zoomRange()?.startIdx ?? 0;
    this.zoomRange.set({ startIdx: i1 + offset, endIdx: i2 + offset });
    this.hoveredIndex.set(null);
  }

  /**
   * Click routing for sub-threshold drags. Two destinations :
   *  - **Annotation mode** : convert the clicked SVG Y to a price via inverse-yAt, persist a
   *    horizontal annotation, then auto-disarm the mode (one annotation per arming for clarity).
   *  - **Measure anchor** : set or replace the anchor at the bar nearest the cursor. Re-clicking
   *    the same bar clears the anchor (toggle behavior, no need for a separate "clear" button).
   *
   * Both paths short-circuit in benchmark mode — annotations are price-anchored, the measure
   * tool's % delta would double up with the benchmark axis already showing distance-from-start.
   */
  private handleChartClick(svgX: number, event: PointerEvent): void {
    const geom = this.chartGeometry();
    if (!geom || this.resolvedBenchmark()) return;

    if (this.annotationMode()) {
      const local = this.svgLocal(event);
      if (local === null) return;
      this.addAnnotationAtY(local.y);
      this.annotationMode.set(false);
      return;
    }

    const innerW = geom.innerRight - geom.innerLeft;
    const t = Math.max(0, Math.min(1, (svgX - geom.innerLeft) / innerW));
    const idx = Math.round(t * (geom.points.length - 1));
    const point = geom.points[idx];
    if (!point) return;
    const current = this.measureAnchor();
    if (current && current.timestamp === point.bar.timestamp) {
      // Toggle off — clicking the anchored bar again clears the anchor.
      this.measureAnchor.set(null);
      return;
    }
    this.measureAnchor.set({
      index: idx,
      price: point.bar.close,
      timestamp: point.bar.timestamp,
    });
  }

  /** Pointer cancel / leave : abort any in-flight drag and clear hover. Keeps the selection
   *  rectangle from "freezing" on screen if the user releases outside the chart. */
  onChartPointerCancel(): void {
    this.dragSelection.set(null);
    this.hoveredIndex.set(null);
  }

  /** Reset zoom — clears [zoomRange], any in-flight drag, the measure anchor, and disarms the
   *  annotation mode. Bound to a button in the toolbar (visible only when zoomed) and to a
   *  double-click on the chart for a faster gesture. */
  resetZoom(): void {
    const wasZoomed =
      this.zoomRange() !== null ||
      this.dragSelection() !== null ||
      this.measureAnchor() !== null ||
      this.annotationMode();
    if (!wasZoomed) return;
    this.zoomRange.set(null);
    this.dragSelection.set(null);
    this.measureAnchor.set(null);
    this.annotationMode.set(false);
    this.hoveredIndex.set(null);
  }

  // ---- Annotations (v3) ----

  /** Hydrates [annotations] from the AnnotationRepository for the current symbol. Called once
   *  on init ; re-call would be needed if we ever support cross-symbol navigation in-page. */
  private loadAnnotations(symbol: string): void {
    this.annotationRepository.list(symbol).subscribe({
      next: (list) => this.annotations.set(list),
      error: () => this.annotations.set([]),
    });
  }

  /** Toggle the "+ annotation" arming state. While armed, the next sub-threshold click on the
   *  chart creates a horizontal annotation at the clicked price. Re-clicking the toolbar button
   *  disarms without placing — escape hatch for "I changed my mind". */
  toggleAnnotationMode(): void {
    if (this.resolvedBenchmark()) return; // disabled in benchmark mode
    this.annotationMode.update((v) => !v);
  }

  /**
   * Inverse-yAt : convert an SVG Y coordinate to a price level via the geometry's exposed
   * `yMin` / `yRange`, then persist a horizontal annotation. Optimistic update — appends to the
   * local list immediately ; in case of error we silently roll back. This is fire-and-forget UX
   * because localStorage writes are synchronous (the future BDD-backed adapter may need a real
   * pending state).
   */
  private addAnnotationAtY(svgY: number): void {
    const geom = this.chartGeometry();
    const sym = this.symbol();
    if (!geom || !sym) return;
    const innerH = geom.innerBottom - geom.innerTop;
    const t = 1 - (svgY - geom.innerTop) / innerH;
    const price = geom.yMin + t * geom.yRange;
    this.annotationRepository.add(sym, { kind: 'hline', value: price, label: null }).subscribe({
      next: (created) => {
        this.annotations.update((list) => [...list, created]);
      },
      error: () => {
        // Silent — the user can retry. v3 doesn't surface localStorage errors (quota exceeded
        // is the only realistic failure and recovery is "remove some old annotations").
      },
    });
  }

  /**
   * Removes an annotation. Optimistic — drops it from the signal immediately ; rollback on
   * error keeps the list consistent if the localStorage write somehow fails. Called from the
   * SVG `<g class="annotation-delete">` handles ; `event.stopPropagation` isn't required here
   * because [onChartPointerDown] already short-circuits when the target is inside `.annotation-delete`.
   */
  removeAnnotation(id: string): void {
    const sym = this.symbol();
    if (!sym) return;
    const previous = this.annotations();
    this.annotations.set(previous.filter((a) => a.id !== id));
    this.annotationRepository.remove(sym, id).subscribe({
      error: () => this.annotations.set(previous),
    });
  }

  /** Keyboard activation for the SVG `<g class="annotation-delete">` handle. ARIA `role="button"`
   *  requires both Enter and Space to activate ; Space scrolls by default so we preventDefault. */
  onAnnotationDeleteKey(event: KeyboardEvent, id: string): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.removeAnnotation(id);
  }

  // ---- Measure tools (v3) ----

  /** Manually clear the anchor. Called from the toolbar "Clear anchor" button (visible only
   *  when one is set). The chart click handler also auto-clears if the user re-clicks the
   *  anchored bar — keep both entry points so the user has a discoverable explicit control too. */
  clearMeasureAnchor(): void {
    this.measureAnchor.set(null);
  }

  // ---- Brush mini-chart (v3) ----

  /**
   * Pointerdown on the brush selector. Three modes selected by where the user grabbed :
   *  - within `handleWidth` of the rectangle's left edge → resize-left (drag the start)
   *  - within `handleWidth` of the right edge → resize-right (drag the end)
   *  - inside the rectangle body → pan (translate both edges)
   *  - outside the rectangle entirely → reset zoom (interpret as "show me everything")
   *
   * The drag is captured on the brush SVG so move/up events keep flowing even if the cursor
   * leaves the small (~50px tall) brush area mid-drag.
   */
  onBrushPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const x = this.svgLocalX(event);
    const geom = this.brushGeometry();
    if (x === null || !geom) return;

    const fullBars = this.chartBars();
    const currentZoom = this.zoomRange();
    const initialRange = currentZoom
      ? { startIdx: currentZoom.startIdx, endIdx: currentZoom.endIdx }
      : { startIdx: 0, endIdx: fullBars.length - 1 };

    const leftEdge = geom.rectX;
    const rightEdge = geom.rectX + geom.rectWidth;
    let kind: BrushDragKind;
    if (Math.abs(x - leftEdge) < geom.handleWidth) {
      kind = 'resize-left';
    } else if (Math.abs(x - rightEdge) < geom.handleWidth) {
      kind = 'resize-right';
    } else if (x >= leftEdge && x <= rightEdge) {
      kind = 'pan';
    } else {
      // Click outside the rectangle → reset zoom. Treats the brush like a navigator : "click
      // empty space = back to full series".
      this.zoomRange.set(null);
      return;
    }

    this.brushDrag.set({ kind, startX: x, initialRange });
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  }

  onBrushPointerMove(event: PointerEvent): void {
    const drag = this.brushDrag();
    if (!drag) return;
    const x = this.svgLocalX(event);
    const geom = this.brushGeometry();
    if (x === null || !geom) return;

    const fullBars = this.chartBars();
    const innerW = geom.innerRight - geom.innerLeft;
    const pxPerBar = innerW / (fullBars.length - 1);
    const deltaIdx = Math.round((x - drag.startX) / pxPerBar);

    let { startIdx, endIdx } = drag.initialRange;
    if (drag.kind === 'pan') {
      const width = endIdx - startIdx;
      startIdx += deltaIdx;
      endIdx += deltaIdx;
      if (startIdx < 0) {
        startIdx = 0;
        endIdx = width;
      } else if (endIdx > fullBars.length - 1) {
        endIdx = fullBars.length - 1;
        startIdx = endIdx - width;
      }
    } else if (drag.kind === 'resize-left') {
      startIdx = Math.max(0, Math.min(endIdx - BRUSH_MIN_BARS, startIdx + deltaIdx));
    } else {
      // resize-right
      endIdx = Math.min(
        fullBars.length - 1,
        Math.max(startIdx + BRUSH_MIN_BARS, endIdx + deltaIdx),
      );
    }

    // Snap to "no zoom" when the user dragged the rectangle to cover the entire series — keeps
    // the toolbar reset button hidden in that natural "back to full" state.
    if (startIdx === 0 && endIdx === fullBars.length - 1) {
      this.zoomRange.set(null);
    } else {
      this.zoomRange.set({ startIdx, endIdx });
    }
  }

  onBrushPointerUp(): void {
    this.brushDrag.set(null);
  }

  /** Maps a `MouseEvent` / `PointerEvent` to its X coordinate in the SVG's user units. The CTM
   *  inverse handles responsive widths and any future SVG-level transforms. */
  private svgLocalX(event: MouseEvent): number | null {
    return this.svgLocal(event)?.x ?? null;
  }

  /** Same shape as [svgLocalX] but returns both axes — used by the click-to-place-annotation
   *  flow (we need Y to convert into a price level via inverse-yAt) and by the brush handlers
   *  even though they only consume X. The selector lookup is per-call : when the listener is
   *  attached to the chart-canvas div, the SVG sits as its first child ; for the brush the
   *  listener is on the brush SVG itself. We probe `currentTarget` first as an SVG, then fall
   *  back to a child query so the same helper works in both layouts. */
  private svgLocal(event: MouseEvent): { x: number; y: number } | null {
    const target = event.currentTarget as Element | null;
    if (!target) return null;
    // Detect "target IS the SVG" via the presence of `getScreenCTM` rather than `instanceof
    // SVGSVGElement` — the latter fails on the fake-SVG shape used in tests, which mocks the
    // CTM contract without inheriting from the real SVGSVGElement prototype.
    const svg =
      'getScreenCTM' in target
        ? (target as unknown as SVGSVGElement)
        : (target.querySelector('svg') as SVGSVGElement | null);
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  // ---- Chart overlays (v2) — multi-select toggle group ----

  /**
   * Replaces the active overlay set. Bound to the multi-select `mat-button-toggle-group` whose
   * `change` event emits the full new array of selected values. Idempotent — no-op when the
   * effective set didn't change (defends against spurious change events from Material).
   */
  setOverlays(values: OverlayKind[]): void {
    const next = new Set(values);
    const current = this.overlayActive();
    if (next.size === current.size && Array.from(next).every((v) => current.has(v))) return;
    this.overlayActive.set(next);
  }

  // ---- Series math used by overlay rendering ----

  /**
   * Rolling arithmetic mean over a window of `n` samples. Returns `null` for the first `n - 1`
   * positions (warmup window — not enough data yet). Linear time via a rolling sum, idiomatic
   * for sliding-window stats on a chart series.
   */
  private rollingMean(values: number[], n: number): (number | null)[] {
    const out: (number | null)[] = [];
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= n) sum -= values[i - n];
      out.push(i >= n - 1 ? sum / n : null);
    }
    return out;
  }

  /**
   * Bollinger bands : rolling 20-period mean ± `k` standard deviations. We compute std with the
   * naive O(n²) loop because n=20 stays small ; a running-variance trick (Welford / two-pass)
   * would be premature optimization on a 250-bar series.
   */
  private bollinger(
    values: number[],
    n: number,
    k: number,
  ): {
    upper: (number | null)[];
    middle: (number | null)[];
    lower: (number | null)[];
  } {
    const middle = this.rollingMean(values, n);
    const upper: (number | null)[] = [];
    const lower: (number | null)[] = [];
    for (let i = 0; i < values.length; i++) {
      const m = middle[i];
      if (m === null) {
        upper.push(null);
        lower.push(null);
        continue;
      }
      let sumSq = 0;
      for (let j = i - n + 1; j <= i; j++) sumSq += (values[j] - m) ** 2;
      const std = Math.sqrt(sumSq / n);
      upper.push(m + k * std);
      lower.push(m - k * std);
    }
    return { upper, middle, lower };
  }

  // ---- Date / price formatters for the chart axes and tooltip ----

  /**
   * Formats a date for the X axis, calibrated to the current timeframe :
   * - intraday (1D, 5D) → `HH:mm`
   * - daily (1M, 3M) → `DD MMM`
   * - 1Y → `MMM YY`
   * - 5Y → `YYYY`
   */
  private formatTickDate(date: Date): string {
    const tf = this.selectedTimeframe();
    const locale = this.language.lang();
    if (tf === '1d') {
      return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    }
    if (tf === '5d') {
      return date.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
    }
    if (tf === '1mo' || tf === '3mo') {
      return date.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
    }
    if (tf === '1y') {
      return date.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
    }
    return date.toLocaleDateString(locale, { year: 'numeric' });
  }

  /**
   * Formats a date for the hover tooltip — more verbose than the axis labels, since the user
   * has paused on a specific bar and wants the unambiguous timestamp.
   */
  private formatHoverDate(date: Date): string {
    const tf = this.selectedTimeframe();
    const locale = this.language.lang();
    if (tf === '1d' || tf === '5d') {
      return date.toLocaleString(locale, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return date.toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private formatPrice(price: number): string {
    return price.toFixed(2);
  }

  /** Signed-percent formatter used by the benchmark overlay (Y axis labels and tooltip).
   *  Values that round to zero (incl. exactly 0, like the first bar's anchor) drop the sign so
   *  the tooltip doesn't flip-flop between `0.00%` and `+0.00%` / `-0.00%` on tiny noise. */
  private formatPercent(value: number): string {
    if (Math.abs(value) < 0.005) return '0.00%';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  /**
   * Signed delta-time formatter for the measure-tools tooltip. Picks an adaptive unit so an
   * intraday timeframe (5min bars) reads in minutes/hours and a multi-year timeframe in days.
   * Sign is always shown (including for zero) so the user knows which direction they measured.
   */
  private formatDeltaTime(deltaMs: number): string {
    const sign = deltaMs >= 0 ? '+' : '-';
    const abs = Math.abs(deltaMs);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (abs < hour) return `${sign}${Math.round(abs / minute)} min`;
    if (abs < day) return `${sign}${Math.round(abs / hour)} h`;
    return `${sign}${Math.round(abs / day)} j`;
  }

  // ---- News actions ----

  /**
   * Fetches up to 10 headlines on init. 503 (Finnhub down / rate-limited) surfaces inline in the
   * news panel — the rest of the dossier (chart, indicators, narrative) stays interactive. Empty
   * list is a normal state (slow-news ticker), not an error.
   */
  private loadNews(symbol: string): void {
    this.newsLoading.set(true);
    this.newsError.set(null);
    this.newsRepository.getForSymbol(symbol).subscribe({
      next: (items) => {
        this.news.set(items);
        this.newsLoading.set(false);
      },
      error: (err: { status?: number }) => {
        this.newsError.set(this.errorMessage(err, symbol));
        this.newsLoading.set(false);
      },
    });
  }

  /**
   * Formats a news date for the inline list. Recent items (< 24 h) show as relative time
   * ("il y a 3 h"), older ones as a localised date. Reuses [LanguageService.lang] so the format
   * follows the active UI locale.
   */
  formatNewsDate(iso: string): string {
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const locale = this.language.lang();
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (diffMs < 60_000) return rtf.format(-Math.floor(diffMs / 1000), 'second');
    if (diffMs < 3_600_000) return rtf.format(-Math.floor(diffMs / 60_000), 'minute');
    if (diffMs < 86_400_000) return rtf.format(-Math.floor(diffMs / 3_600_000), 'hour');
    if (diffMs < 7 * 86_400_000) return rtf.format(-Math.floor(diffMs / 86_400_000), 'day');
    return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ---- Fundamentals — analyst recommendations ----

  /**
   * Fetches the analyst snapshot for the dossier. Three terminal states (mutually exclusive
   * after `analystLoading` flips to false) :
   * - **404** → `analystNotCovered = true`, panel shows "no coverage" empty state.
   * - **503** → `analystError` set, panel shows inline error banner.
   * - **success** → `analyst` set, panel renders breakdown + consensus + price target + history.
   *
   * Errors stay scoped to the panel — the rest of the dossier (chart, news, narrative) keeps
   * rendering. Same isolation rule as the news panel.
   */
  private loadAnalyst(symbol: string): void {
    this.analystLoading.set(true);
    this.analystNotCovered.set(false);
    this.analystError.set(null);
    this.analyst.set(null);
    this.analystRepository.getForSymbol(symbol).subscribe({
      next: (snap) => {
        this.analyst.set(snap);
        this.analystLoading.set(false);
      },
      error: (err: { status?: number }) => {
        if (err?.status === 404) {
          this.analystNotCovered.set(true);
        } else {
          this.analystError.set(this.errorMessage(err, symbol));
        }
        this.analystLoading.set(false);
      },
    });
  }

  /**
   * Percentage of the segmented bar a given bucket should occupy. Falls back to 0 when there's
   * no snapshot or no analysts so the template can call this unconditionally without guards.
   */
  analystBucketPct(bucket: 'strongBuy' | 'buy' | 'hold' | 'sell' | 'strongSell'): number {
    const a = this.analyst();
    if (!a || a.totalAnalysts === 0) return 0;
    return (a[bucket] / a.totalAnalysts) * 100;
  }

  /**
   * Tendency between the oldest and newest history snapshots — drives an arrow in the panel
   * header (up = upgraded over the window, down = downgraded, flat = stable). Compares the
   * bullish-minus-bearish *fraction* on each end so a change in the analyst count doesn't bias
   * the result.
   */
  analystTrend = computed<'up' | 'down' | 'flat'>(() => {
    const a = this.analyst();
    if (!a || a.history.length < 2) return 'flat';
    const score = (m: {
      strongBuy: number;
      buy: number;
      sell: number;
      strongSell: number;
      hold: number;
    }) => {
      const total = m.strongBuy + m.buy + m.hold + m.sell + m.strongSell;
      if (total === 0) return 0;
      return (m.strongBuy + m.buy - (m.sell + m.strongSell)) / total;
    };
    const first = score(a.history[0]);
    const last = score(a.history[a.history.length - 1]);
    const delta = last - first;
    if (delta > TREND_EPSILON) return 'up';
    if (delta < -TREND_EPSILON) return 'down';
    return 'flat';
  });

  // ---- Fundamentals — earnings ----

  /**
   * Fetches the earnings snapshot for the dossier. Three terminal states (mutually exclusive
   * after `earningsLoading` flips to false) :
   * - **404** → `earningsNotCovered = true`, panel shows "no earnings data" empty state.
   * - **503** → `earningsError` set, panel shows inline error banner.
   * - **success** → `earnings` set, panel renders next-date countdown (when present) + last 4
   *   reports with EPS estimate / actual / surprise %.
   *
   * Errors stay scoped to the panel — the rest of the dossier (chart, news, narrative, analyst)
   * keeps rendering. Same isolation rule as the news and analyst panels.
   */
  private loadEarnings(symbol: string): void {
    this.earningsLoading.set(true);
    this.earningsNotCovered.set(false);
    this.earningsError.set(null);
    this.earnings.set(null);
    this.earningsRepository.getForSymbol(symbol).subscribe({
      next: (snap) => {
        this.earnings.set(snap);
        this.earningsLoading.set(false);
      },
      error: (err: { status?: number }) => {
        if (err?.status === 404) {
          this.earningsNotCovered.set(true);
        } else {
          this.earningsError.set(this.errorMessage(err, symbol));
        }
        this.earningsLoading.set(false);
      },
    });
  }

  /**
   * Threshold (in days) at which the countdown pill flips to a warning-tinted style. ≤ 7 days
   * out is "imminent enough that the user should notice" without crowding the dossier with
   * persistent alarms. Picked by feel — alignable with the watchlist alerts feature later.
   */
  private static readonly EARNINGS_IMMINENT_THRESHOLD_DAYS = 7;

  /**
   * Days between today and the next earnings date — drives the countdown label. Returns `null`
   * when the date is missing (calendar endpoint failed soft) so the template can hide the
   * countdown line. Anchored on UTC dates to avoid timezone drift on the boundary day.
   */
  earningsCountdownDays = computed<number | null>(() => {
    const e = this.earnings();
    if (!e?.nextEarningsDate) return null;
    const target = new Date(`${e.nextEarningsDate}T00:00:00Z`).getTime();
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    return Math.round((target - todayUtc) / EARNINGS_MS_PER_DAY);
  });

  /**
   * True when the next earnings date sits within the imminent window (0 to 7 days from today,
   * inclusive). Drives a warning-tinted countdown pill so the user notices the upcoming print
   * without the rest of the dossier shouting at them. Negative deltas (past dates that linger
   * in the calendar feed for a few hours after the print) deliberately fall through — a past
   * date isn't imminent.
   */
  earningsCountdownImminent = computed<boolean>(() => {
    const days = this.earningsCountdownDays();
    if (days === null) return false;
    return days >= 0 && days <= TickerPage.EARNINGS_IMMINENT_THRESHOLD_DAYS;
  });

  /**
   * Reports as the front renders them — newest-first. The wire / domain contract is oldest-first
   * (so the trend reads left-to-right naturally on the timeline view in the analyst sub-block),
   * but the earnings table reads better with the most recent quarter at the top where the eye
   * lands. Materialised once per `earnings()` change rather than recomputed on every CD pass via
   * `slice().reverse()` in the template.
   */
  earningsReportsNewestFirst = computed(() => {
    const e = this.earnings();
    return e ? [...e.lastReports].reverse() : [];
  });

  /**
   * Sign label for a report's surprise %, used to colour the chip. `beat` for >0, `miss` for <0,
   * `inline` for exactly 0. Returns `null` when the surprise is missing (the front hides the chip).
   * The threshold for "inline" is exact zero — a -0.1 % miss is still a miss directionally.
   */
  earningsSurpriseSign(report: {
    surprisePercent: number | null;
  }): 'beat' | 'miss' | 'inline' | null {
    if (report.surprisePercent === null || report.surprisePercent === undefined) return null;
    if (report.surprisePercent > 0) return 'beat';
    if (report.surprisePercent < 0) return 'miss';
    return 'inline';
  }

  // ---- Watchlist actions ----

  /**
   * Fetches the current watchlist on init to derive [isWatched] for the active symbol. We don't
   * have a `/watchlist/contains/:symbol` endpoint — calling `list()` is fine because the list
   * stays small in practice (dozens of entries max for a personal app). Silent failure : button
   * just stays in the "not watched" state, the user can click to retry.
   */
  private loadWatchlistState(symbol: string): void {
    const upper = symbol.toUpperCase();
    this.watchlistRepository.list().subscribe({
      next: (entries) => this.isWatched.set(entries.some((e) => e.symbol === upper)),
      error: () => this.isWatched.set(false),
    });
  }

  /**
   * Toggles the watchlist state for the current symbol. Optimistic : the button flips visually
   * immediately, then we call the server. On error we roll back. The backend's idempotent add
   * means a quick double-click on a fresh symbol just yields the same row twice — no harm.
   */
  toggleWatchlist(): void {
    const sym = this.symbol();
    if (!sym || this.watchlistBusy()) return;
    const wasWatched = this.isWatched();
    this.watchlistBusy.set(true);
    this.isWatched.set(!wasWatched);

    // `remove` returns Observable<void> and `add` returns Observable<WatchlistEntry> ; the union
    // can't be subscribed to directly without a cast. Keep the two calls in separate branches —
    // explicit and the handlers stay shared via local `onDone` / `onFail`.
    const onDone = () => this.watchlistBusy.set(false);
    const onFail = () => {
      this.isWatched.set(wasWatched);
      this.watchlistBusy.set(false);
    };
    if (wasWatched) {
      this.watchlistRepository.remove(sym).subscribe({ next: onDone, error: onFail });
    } else {
      this.watchlistRepository.add(sym).subscribe({ next: onDone, error: onFail });
    }
  }

  // ---- Narrative actions ----

  private loadLatestNarrative(symbol: string): void {
    this.marketRepository.getLatestNarrative(symbol).subscribe({
      next: (snap) => this.narrative.set(snap),
      error: () => {
        this.narrative.set(null);
      },
    });
  }

  generateNarrative(): void {
    const sym = this.symbol();
    if (!sym || this.narrativeLoading()) return;
    this.narrativeLoading.set(true);
    this.narrativeError.set(null);
    this.narrativePollSub?.unsubscribe();

    this.marketRepository.requestNarrative(sym).subscribe({
      next: (job) => {
        if (job.status === 'DONE') {
          this.fetchNarrativeAfterCompletion(sym);
          return;
        }
        if (job.status === 'ERROR') {
          this.narrativeError.set(
            job.error ?? this.translate.instant('ticker.narrative.errorGeneric'),
          );
          this.narrativeLoading.set(false);
          return;
        }
        this.narrativePollSub = this.marketRepository.pollNarrativeJob(sym, job.jobId).subscribe({
          next: (updated) => {
            if (updated.status === 'DONE') {
              this.fetchNarrativeAfterCompletion(sym);
            } else if (updated.status === 'ERROR') {
              this.narrativeError.set(
                updated.error ?? this.translate.instant('ticker.narrative.errorGeneric'),
              );
              this.narrativeLoading.set(false);
            }
          },
          error: (err: Error) => {
            this.narrativeError.set(
              err.message ?? this.translate.instant('ticker.narrative.errorPolling'),
            );
            this.narrativeLoading.set(false);
          },
        });
      },
      error: () => {
        this.narrativeError.set(this.translate.instant('ticker.narrative.errorRequest'));
        this.narrativeLoading.set(false);
      },
    });
  }

  private fetchNarrativeAfterCompletion(symbol: string): void {
    this.marketRepository.getLatestNarrative(symbol).subscribe({
      next: (snap) => {
        this.narrative.set(snap);
        this.narrativeLoading.set(false);
      },
      error: () => {
        this.narrativeError.set(this.translate.instant('ticker.narrative.errorReload'));
        this.narrativeLoading.set(false);
      },
    });
  }

  sentimentClass(s: TickerNarrativeSnapshot | null): string {
    if (!s) return '';
    return `sentiment-${s.sentiment.toLowerCase()}`;
  }
}
