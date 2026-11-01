import { DatePipe, DecimalPipe, formatDate } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, LOCALE_ID, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  PageEvent,
  Sort,
  StbButtonModule,
  StbButtonToggleModule,
  StbCheckboxModule,
  StbChipsModule,
  StbConfirmPick,
  StbDatePickerModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbPaginatorModule,
  StbSelectModule,
  StbSkeletonKpiRow,
  StbSkeletonTable,
  StbSortHeaderModule,
  StbTableModule,
  StbToast,
  StbTooltipModule,
  stbLoadGate,
} from '@portfolioai/ui';
import { isToday, isYesterday } from 'date-fns';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  concatMap,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import {
  DEFAULT_PATTERN,
  Pattern,
  STAT_PATTERNS,
  StatPattern,
} from '../../core/api/shared/pattern.model';
import {
  OutOfPatternReason,
  PageRequest,
  REJECTION_NOTE_MAX_LENGTH,
  REJECTION_REASONS,
  StatEntry,
  StatEntryFilter,
  StatEntryInput,
  StatRejectionReason,
  countsInFigures,
} from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { MarketClock } from '../../core/app-state/market-clock.service';
import { HasUnsavedChanges } from '../../core/router/unsaved-changes.guard';
import { keptValue } from '../../shared/kept-value/kept-value';
import { NumberMaskDirective } from '../../shared/number-mask/number-mask.directive';
import { PeriodFilter } from '../../shared/period-filter/period-filter';
import { PeriodSelection } from '../../shared/period-preset/period-preset';
import { PluralPipe } from '../../shared/plural/plural';
import { PricePipe } from '../../shared/price/price.pipe';
import {
  skeletonHeaderKeys,
  toSkeletonColumns,
} from '../../shared/skeleton-columns/skeleton-columns';
import { ShortGainPipe } from './short-gain.pipe';
import { DEFAULT_CHART_SIZES, StatChart, StatChartPoint } from './stat-chart/stat-chart';
import { StatKpis } from './stat-kpis/stat-kpis';
import {
  BLANK_PREMARKET,
  BLANK_SESSION,
  COLUMNS,
  DEFAULT_PAGE_SIZE,
  DERIVED_FILTERS,
  DOUBLE_TOP_FOOTER_COLUMNS,
  DOUBLE_TOP_PRICES,
  DOUBLE_TOP_TIMES,
  DT_DROP_SINCE,
  DerivedFilter,
  HELD_REASONS,
  IDLE,
  IdentityModel,
  NO_COLUMNS,
  NO_TYPED_PUSH,
  PremarketModel,
  PremarketPrice,
  SESSION_FOOTER_COLUMNS,
  SKELETON_COLUMNS,
  STATUS_TABS,
  SaveState,
  SessionField,
  SessionModel,
  SessionPrice,
  SessionTime,
  SheetCard,
  SortRequest,
  StatRow,
  StatTab,
  StatView,
  VIEWS,
  derivedFromQuery,
  doubleTopPoints,
  dropCanBeNotRead,
  expectedPrices,
  isAsked,
  isPositive,
  isSessionView,
  markCleared,
  missingPrices,
  premarketOf,
  premarketProblem,
  retestTookTop,
  sessionOf,
  sessionProblem,
  tabFromQuery,
  viewOf,
} from './stats-sheet.rules';
import {
  DT_EXTENSION_CRITERION,
  DT_REJECTION_CRITERION,
  GUS_DROP_TARGET,
  MARKET_OPEN,
  cumulativePercent,
  doubleTopDurations,
  doubleTopLegs,
  gapPercent,
  gusSequence,
  holdPercent,
  percentVsOpen,
  pmPushPercent,
} from './stats.math';

/**
 * Stats page — the sheet filled as the day goes and ticked once complete (cf. `mockup/stats.html`
 * and `mockup/PARCOURS.md`, step 5) :
 *
 * - **Views** (#437) : GUS / DT / All pick the KPIs, the table's columns and the averages — a GUS
 *   is measured by its session, a double top by its three legs ; « All » keeps what compares across
 *   patterns and sums each stat up in its own, with no averages.
 * - **KPIs** over the filtered set (not the current page) : stats completed / to complete, average
 *   push at open, average LOD, fade at the close — or the legs of the double tops. They come from
 *   `GET /api/stats/summary`.
 * - **Session panel** : the premarket recap on top, then the session prices with their live % vs
 *   the open and the three flags — each saved on its own, when the field is left (an edit : no
 *   modal) — the « n / 5 » progress (4 on a no-push day), Close, and the ✓ that ticks the stat once
 *   its prices are in. A DT stat shows the « Double top » card instead : its four prices, the legs
 *   computed live, « n / 4 ». It opens on the first stat to complete of the page and on any row's
 *   button.
 * - **The ✓ column** ticks / unticks a stat from the table (#263). A ticked stat can't lose a price :
 *   clearing one is refused with a toast — untick it first.
 * - **Table** in two column groups — Premarket (copied from the candidate) and Session (price + %
 *   vs the open) — then the flags. Every column is kept ; horizontal scrolling is fine.
 * - **Filters** : search, period (preset or custom range, shared [PeriodFilter]), the view, status
 *   (« No push » in the GUS view only) ; server-side sort + pagination.
 *
 * Stats are born from a candidate (#189) or typed by hand (« New stat », #326). The « → Trade »
 * column (#193) is the **only** way a trade comes into existence : one per stat, confirmed, and the
 * row shows a link to that trade from then on.
 *
 * The listing and its summaries are resources keyed on the filters, sort and page : any change
 * refetches, cancelling the request it supersedes (#370) ; a write reloads them.
 */
@Component({
  selector: 'app-stats-page',
  host: {
    '(window:beforeunload)': 'warnBeforeUnload($event)',
  },
  imports: [
    DatePipe,
    DecimalPipe,
    PricePipe,
    NumberMaskDirective,
    PeriodFilter,
    RouterLink,
    StbButtonModule,
    StbButtonToggleModule,
    StbCheckboxModule,
    StbChipsModule,
    StbDatePickerModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbPaginatorModule,
    StbSelectModule,
    StbSortHeaderModule,
    StbSkeletonTable,
    StbSkeletonKpiRow,
    StbTableModule,
    StbTooltipModule,
    PluralPipe,
    ShortGainPipe,
    StatChart,
    StatKpis,
    TranslatePipe,
  ],
  templateUrl: './stats-page.html',
  styleUrl: './stats-page.scss',
})
export class StatsPage implements HasUnsavedChanges {
  private readonly repo = inject(StatsRepository);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(StbToast);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly locale = inject(LOCALE_ID);

  // ---- Pagination ----
  readonly pageIndex = signal(0);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly pageSizeOptions = [10, 25, 50, 100];

  // ---- Search (debounced 250 ms) ----
  private readonly searchInput$ = new Subject<string>();
  readonly searchTerm = toSignal(
    this.searchInput$.pipe(debounceTime(250), distinctUntilChanged()),
    {
      initialValue: '',
    },
  );
  readonly searchValue = signal('');

  // ---- Filters ----
  readonly period = signal<PeriodSelection>({ period: 'all', dateFrom: null, dateTo: null });
  /** What « New stat » picks from — a stat's patterns only (#648). */
  readonly patterns = STAT_PATTERNS;
  readonly views = VIEWS;
  /**
   * Opens on the tab named by `?status=`, the way « Complete » on the Today page lands (#337), and
   * follows it if the query changes under the same page. Picking a tab does not write the URL back.
   */
  private readonly queryTab = toSignal(
    this.route.queryParamMap.pipe(map((params) => tabFromQuery(params.get('status')))),
    { requireSync: true },
  );
  /**
   * GUS by default ; a link naming a status lands on « All », since a double top left to complete
   * — or dropped by the scanner to review — is one of them.
   */
  readonly view = linkedSignal<StatView>(() => {
    const tab = this.queryTab();
    return tab === 'TO_COMPLETE' || tab === 'COMPLETED' || tab === 'TO_REVIEW' ? 'ALL' : 'GUS';
  });
  readonly status = linkedSignal<StatTab>(() => this.queryTab());
  readonly derivedFilters = DERIVED_FILTERS;
  /** Read off `?derived=` like the tab off `?status=` (#499), so a link can carry the toggles. */
  private readonly queryDerived = toSignal(
    this.route.queryParamMap.pipe(map((params) => derivedFromQuery(params.getAll('derived')))),
    { requireSync: true },
  );
  readonly derived = linkedSignal<readonly DerivedFilter[]>(() => this.queryDerived());
  /** « Rejetées » (#764) : the rejected scanner stats, hidden everywhere else — combines with a tab. */
  readonly withRejected = signal(false);
  /** The views measured like a GUS session — their own tab, cumulative and medians row (#499). */
  readonly sessionView = computed(() => isSessionView(this.view()));
  /** « No push » belongs to the session views : a double top has no push at the open. */
  readonly statusTabs = computed(() =>
    this.sessionView() ? STATUS_TABS : STATUS_TABS.filter((tab) => tab !== 'NO_PUSH'),
  );

  // ---- Sort ----
  readonly sort = signal<SortRequest>({ columnName: '', isAscending: true });

  readonly columns = computed(() => COLUMNS[this.view()]);

  // ---- Data, loaded from the signals above ----
  /**
   * Bumped by a write, and part of the resources' params : a new key supersedes a load in flight,
   * where `reload()` is a no-op while one runs — its pre-write answer would win. A field saved on a
   * ticked stat only moves the KPIs, hence their own counter.
   */
  private readonly listingWrites = signal(0);
  private readonly kpiWrites = signal(0);
  private readonly criteria = computed<StatEntryFilter>(() => {
    const range = this.period();
    const tab = this.status();
    const view = this.view();
    return {
      query: this.searchTerm() || null,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      pattern: view === 'ALL' ? null : view,
      status: tab === 'NO_PUSH' || tab === 'TO_REVIEW' ? null : tab,
      noPush: tab === 'NO_PUSH' || null,
      review: tab === 'TO_REVIEW' ? 'TO_REVIEW' : null,
      withRejected: this.withRejected() || null,
      outOfPattern: this.derived().includes('OUT_OF_PATTERN') || null,
      under1Dollar: this.derived().includes('UNDER_1_DOLLAR') || null,
    };
  });

  private readonly listing = rxResource({
    params: () => {
      const sort = this.sort();
      const page: PageRequest = {
        pageIndex: this.pageIndex(),
        pageSize: this.pageSize(),
        sortField: sort.columnName || undefined,
        sortDirection: sort.columnName ? (sort.isAscending ? 'asc' : 'desc') : undefined,
      };
      return { filter: this.criteria(), page, writes: this.listingWrites() };
    },
    stream: ({ params }) =>
      this.repo
        .findAll(params.filter, params.page)
        .pipe(tap(({ content }) => this.listed(content))),
  });
  private readonly page = keptValue(this.listing);
  readonly loading = this.listing.isLoading;
  readonly error = computed(() => this.listing.status() === 'error');
  readonly entries = computed<StatEntry[]>(() => this.page()?.content ?? []);
  readonly totalElements = computed(() => this.page()?.totalElements ?? 0);

  private readonly summaryResource = rxResource({
    params: () => ({ filter: this.criteria(), writes: this.kpiWrites() }),
    stream: ({ params }) => this.repo.summary(params.filter),
  });
  readonly summary = keptValue(this.summaryResource);
  /**
   * The « No push » tab's KPI (#334) : how often a day goes without a push, over every completed
   * stat of the period — the tab's own summary only holds the no-push days, so the rate needs the
   * summary without that filter. The whole period, whatever the search box holds : one ticker over
   * itself is not a rate. No request outside that tab.
   */
  private readonly periodSummaryResource = rxResource({
    params: () => {
      const criteria = this.criteria();
      if (!criteria.noPush) return undefined;
      return { filter: { ...criteria, noPush: null, query: null }, writes: this.kpiWrites() };
    },
    stream: ({ params }) => this.repo.summary(params.filter),
  });
  private readonly periodSummary = keptValue(this.periodSummaryResource);
  /**
   * The « À relire » tab's count (#764) : every pattern, whatever the view and the tab — the scanner
   * drops GUS and double tops alike, and the tab opens on « All ».
   */
  private readonly reviewCountResource = rxResource({
    params: () => {
      const { query, dateFrom, dateTo } = this.criteria();
      return { filter: { query, dateFrom, dateTo }, writes: this.kpiWrites() };
    },
    stream: ({ params }) => this.repo.countToReview(params.filter),
  });
  private readonly keptReviewCount = keptValue(this.reviewCountResource);
  readonly reviewCount = computed(() => this.keptReviewCount() ?? 0);
  readonly noPushRate = computed(() => {
    const period = this.periodSummary();
    if (period === null) return null;
    return {
      count: period.noPushCount,
      total: period.completed,
      share: period.completed > 0 ? (period.noPushCount / period.completed) * 100 : null,
    };
  });

  /** First load only (#539) : a refetch dims the table instead. */
  readonly gate = stbLoadGate(this.loading);
  private readonly headerLabels = toSignal(
    this.translate.stream(skeletonHeaderKeys(SKELETON_COLUMNS)) as Observable<
      Record<string, string>
    >,
    { initialValue: {} },
  );
  readonly skeletonColumns = computed(() =>
    toSkeletonColumns(this.columns(), SKELETON_COLUMNS, this.headerLabels()),
  );
  /**
   * The bottom row : the DT view's averages, a session view's medians (#499) — its label spans the
   * columns before the figures. « All » has none.
   */
  readonly footerColumns = computed(() => {
    const view = this.view();
    if (view === 'DT') return DOUBLE_TOP_FOOTER_COLUMNS;
    return isSessionView(view) ? SESSION_FOOTER_COLUMNS : NO_COLUMNS;
  });
  readonly extensionCriterion = DT_EXTENSION_CRITERION;
  readonly rejectionCriterion = DT_REJECTION_CRITERION;
  readonly gusDropTarget = GUS_DROP_TARGET;
  readonly marketOpen = MARKET_OPEN;

  /**
   * The day's rows with their derived percentages. The GUS drop's « to fill » waits for a period :
   * over the whole history every completed GUS lacks it, and an all-amber column nudges no one.
   */
  readonly rows = computed<StatRow[]>(() => {
    const bounded = this.period().period !== 'all';
    return this.entries().map((e) => ({
      ...e,
      gap: gapPercent(e.previousClose, e.pmOpen),
      pmPush: pmPushPercent(e.pmOpen, e.pmHigh),
      cumulativePmHigh: cumulativePercent(e.previousClose, e.pmHigh),
      cumulativeOpen: cumulativePercent(e.previousClose, e.openPrice),
      hold: holdPercent(e.pmHigh, e.openPrice),
      pushOpenPercent: percentVsOpen(e.openPrice, e.pushOpenPrice),
      hodPercent: percentVsOpen(e.openPrice, e.hodPrice),
      lodPercent: percentVsOpen(e.openPrice, e.lodPrice),
      eodPercent: percentVsOpen(e.openPrice, e.eodPrice),
      legs: doubleTopLegs(e),
      durations: doubleTopDurations(e),
      gus: gusSequence(e),
      gusDropToFill:
        bounded && e.completed && e.pattern !== 'DT' && e.gusDropPrice === null && !e.dropNotRead,
      missing: missingPrices(e, e.pattern, e.tradeDate),
      // A row written before the range rule existed can still hold an impossible set : the ✓ of
      // the table answers for it like the panel's does, and the backend replays it on the tick.
      issue: sessionProblem(sessionOf(e), e.pattern)?.reason ?? null,
    }));
  });

  // ---- Session panel ----
  /** The stat open in the panel — null = the panel is closed. */
  readonly completing = signal<StatEntry | null>(null);
  readonly premarket = signal<PremarketModel>(BLANK_PREMARKET);
  readonly session = signal<SessionModel>(BLANK_SESSION);
  readonly saveStates = signal<Record<SheetCard, SaveState>>({ premarket: IDLE, session: IDLE });

  // ---- New stat (#326) : the same two cards, empty, with the identity on top ----
  readonly creating = signal(false);
  readonly identity = signal<IdentityModel>({
    tradeDate: null,
    pattern: DEFAULT_PATTERN,
    ticker: '',
  });
  // ---- Same ticker, another pattern (#507) ----
  /** The patterns the open stat's day and ticker have no stat for yet — empty hides the action. */
  readonly freePatterns = signal<Pattern[]>([]);
  /** A stat is a GUS or a DT (#648) : the other one is the only pattern left to give birth to. */
  readonly siblingPattern = computed(() => this.freePatterns()[0] ?? null);

  /** A stat is dated up to today — the picker stops there, the backend refuses a future day. */
  readonly maxDate = inject(MarketClock).today;
  /** Rows the user closed — they stop auto-opening the panel for this visit. */
  private readonly dismissed = signal<ReadonlySet<string>>(new Set());
  /**
   * Every write goes through this queue, one at a time : a field left right before a click on ✓
   * must reach the server first, or the tick would be judged on the row without that price.
   */
  private readonly writes = new Subject<Observable<unknown>>();
  /**
   * Whether the next listing keeps the panel wherever its stat went : a reload a write asked for
   * (tick, create, delete), and the first one, which a `?stat=` link may have opened off the page.
   */
  private keepPanelOnNextLoad = true;

  /** Live gap, premarket push and cumulative at the PM high under their fields, as the user types. */
  readonly premarketPercents = computed(() => {
    const m = this.premarket();
    return {
      gap: gapPercent(m.previousClose, m.pmOpen),
      pmPush: pmPushPercent(m.pmOpen, m.pmHigh),
      cumulativePmHigh: cumulativePercent(m.previousClose, m.pmHigh),
    };
  });

  /** Hold and cumulative at the open under the session's open (#499) — they read the premarket card. */
  readonly openPercents = computed(() => {
    const { previousClose, pmHigh } = this.premarket();
    const open = this.session().openPrice;
    return {
      hold: holdPercent(pmHigh, open),
      cumulative: cumulativePercent(previousClose, open),
    };
  });

  /** PM high under the PM open — shown under the field, and nothing is sent. */
  readonly pmHighBelowPmOpen = computed(() => {
    const { pmOpen, pmHigh } = this.premarket();
    return pmOpen !== null && pmHigh !== null && pmHigh < pmOpen;
  });

  /** What « Create the stat » still needs — i18n keys, empty once it can go. */
  readonly createMissing = computed(() => {
    const id = this.identity();
    const missing: string[] = [];
    if (!id.tradeDate) missing.push('stats.fields.tradeDate');
    if (!id.ticker.trim()) missing.push('stats.fields.ticker');
    if (premarketProblem(this.premarket(), id.pattern)) {
      missing.push('stats.create.premarketPrices');
    }
    return missing;
  });

  /** The day of the stat in the panel — the one picked in « New stat » while creating. */
  readonly panelDate = computed(() =>
    this.creating() ? this.identity().tradeDate : (this.completing()?.tradeDate ?? null),
  );
  /** The pattern of the stat in the panel — the one picked in « New stat » while creating. */
  readonly panelPattern = computed(() =>
    this.creating() ? this.identity().pattern : this.premarket().pattern,
  );
  /** A DT stat shows the « Double top » card in place of the session one. */
  readonly isDoubleTop = computed(() => this.panelPattern() === 'DT');

  /** The pattern's points as typed, for the chart — BARES for a DT, OPS for a GUS (#784). */
  readonly chartPoints = computed<StatChartPoint[]>(() => {
    const m = this.session();
    if (this.isDoubleTop()) {
      return [
        { name: 'Base', time: m.dtStartTime, price: m.dtStartPrice, above: false },
        { name: 'Apex', time: m.dtTopTime, price: m.dtTopPrice, above: true },
        { name: 'Rejection', time: m.dtLowTime, price: m.dtLowPrice, above: false },
        { name: 'Echo', time: m.dtRetestTime, price: m.dtRetestPrice, above: true },
        { name: 'Sink', time: m.dtDropTime, price: m.dtDropPrice, above: false },
      ];
    }
    return [
      { name: 'Open', time: null, price: m.openPrice, above: false },
      ...(m.noPush
        ? []
        : [{ name: 'Push', time: m.pushOpenTime, price: m.pushOpenPrice, above: true }]),
      { name: 'Sink', time: m.gusDropTime, price: m.gusDropPrice, above: false },
    ];
  });

  /** The legs of the double top being typed, live. */
  readonly doubleTopLegs = computed(() => doubleTopLegs(this.session()));

  /** How long each leg of the double top being typed took, live (#469). */
  readonly doubleTopDurations = computed(() => doubleTopDurations(this.session()));

  /**
   * « 3 / 5 prix · 2 / 5 heures » — the prices and the times a double top needs to tick, four of
   * each when the retest took the top (#710) or before the drop was asked (#726).
   */
  readonly doubleTopProgress = computed(() => {
    const m = this.session();
    const date = this.panelDate();
    const prices = doubleTopPoints(DOUBLE_TOP_PRICES, m, date);
    return {
      prices: prices.filter(({ field }) => isPositive(m[field])).length,
      times: doubleTopPoints(DOUBLE_TOP_TIMES, m, date).filter(({ field }) => !!m[field]).length,
      total: prices.length,
      tookTop: retestTookTop(m),
      dropAsked: isAsked({ since: DT_DROP_SINCE }, date),
      notRead: m.dropNotRead,
    };
  });

  /** Whether the panel offers « Sink non relevé » (#729) — hidden where no Sink is asked. */
  readonly dropMarkable = computed(() =>
    dropCanBeNotRead(this.session(), this.panelPattern(), this.panelDate()),
  );

  /** The GUS being typed (#713), live : its drop, the push's minutes after the bell and the drop's. */
  readonly gusSequence = computed(() => gusSequence(this.session()));
  /** The optional Sink is whole — the count says « Sink ✓ » rather than « Sink à saisir ». */
  readonly gusDropDone = computed(() => {
    const m = this.session();
    return isPositive(m.gusDropPrice) && !!m.gusDropTime && (m.noPush || !!m.pushOpenTime);
  });

  /** Live % vs the open for each session input, as the user types. */
  readonly sessionPercents = computed(() => {
    const m = this.session();
    return {
      pushOpen: percentVsOpen(m.openPrice, m.pushOpenPrice),
      hod: percentVsOpen(m.openPrice, m.hodPrice),
      lod: percentVsOpen(m.openPrice, m.lodPrice),
      eod: percentVsOpen(m.openPrice, m.eodPrice),
    };
  });

  /** The required premarket prices left empty on an existing stat — each one says so under its field. */
  readonly premarketRequired = computed(() => {
    const m = this.premarket();
    const edit = this.completing() !== null && !this.isDoubleTop();
    return {
      previousClose: edit && !isPositive(m.previousClose),
      pmOpen: edit && !isPositive(m.pmOpen),
      pmHigh: edit && !isPositive(m.pmHigh),
    };
  });

  /** The chart's candle size per view, kept from one stat to the next (#854). */
  readonly chartSizes = signal(DEFAULT_CHART_SIZES);

  /**
   * The panel shows values the stat doesn't hold — a save held back by a validation, whichever. A
   * sent save patches the row at once, so only edits that never left count ; leaving drops them.
   */
  readonly hasPendingEdits = computed(() => {
    const entry = this.completing();
    return (
      entry !== null &&
      !(
        // The note goes out trimmed : a trailing space is not an edit left behind.
        samePremarket(
          { ...this.premarket(), note: this.premarket().note.trim() },
          premarketOf(entry),
        ) && sameSession(this.session(), sessionOf(entry))
      )
    );
  });

  hasUnsavedChanges(): boolean {
    return this.hasPendingEdits();
  }

  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  /** What makes the session block impossible, and which fields say so — null when it holds. */
  readonly sessionIssue = computed(() => sessionProblem(this.session(), this.panelPattern()));

  /** True when [field] takes part in the current incoherence — its own hint then says which. */
  atFault(field: SessionField): boolean {
    return this.sessionIssue()?.fields.includes(field) ?? false;
  }

  /** Label keys of the prices the panel still misses. */
  readonly sessionMissing = computed(() =>
    missingPrices(this.session(), this.panelPattern(), this.panelDate()),
  );
  readonly sessionPriceCount = computed(
    () => expectedPrices(this.session(), this.panelPattern(), this.panelDate()).length,
  );
  readonly sessionFilled = computed(() => this.sessionPriceCount() - this.sessionMissing().length);
  /** The push typed before « no push » was ticked, and its time — given back if it is unticked. */
  private typedPush = NO_TYPED_PUSH;

  constructor() {
    this.writes.pipe(concatMap((write) => write)).subscribe();

    // « In stats » on a candidate lands here with `?stat=` (#383) : that stat, its panel open, even
    // when it is not on the first page.
    this.route.queryParamMap
      .pipe(
        map((params) => params.get('stat')),
        distinctUntilChanged(),
        filter((id): id is string => id !== null),
        switchMap((id) =>
          this.repo.findById(id).pipe(
            catchError(() => {
              this.toasts.error(this.translate.instant('stats.snackbar.openError'));
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((entry) => {
        // Off the table otherwise : the next listing would close the panel it just opened (#383).
        if (entry.review === 'REJECTED') this.withRejected.set(true);
        this.followView(entry);
        this.open(entry);
      });
  }

  // ---- Filter handlers ----

  onSearchInput(value: string): void {
    this.searchValue.set(value);
    this.searchInput$.next(value);
    this.pageIndex.set(0);
  }

  setPeriod(selection: PeriodSelection): void {
    this.period.set(selection);
    this.pageIndex.set(0);
  }

  setView(view: StatView): void {
    this.view.set(view);
    if (!isSessionView(view) && this.status() === 'NO_PUSH') this.status.set(null);
    this.pageIndex.set(0);
  }

  /** « À relire » opens on « All » : the scanner drops GUS and double tops alike (#764). */
  setStatus(status: StatTab): void {
    this.status.set(status);
    if (status === 'TO_REVIEW') this.view.set('ALL');
    this.pageIndex.set(0);
  }

  setWithRejected(withRejected: boolean): void {
    this.withRejected.set(withRejected);
    this.pageIndex.set(0);
  }

  setDerived(filters: readonly DerivedFilter[]): void {
    this.derived.set(filters);
    this.pageIndex.set(0);
  }

  /** The out-of-pattern tag's tooltip : what the recorded prices say, reason by reason (#499). */
  outOfPatternHint(reasons: readonly OutOfPatternReason[]): string {
    return reasons
      .map((reason) => this.translate.instant('stats.outOfPattern.' + reason))
      .join(' · ');
  }

  onSortChange(sort: Sort): void {
    this.sort.set({
      columnName: sort.direction ? sort.active : '',
      isAscending: sort.direction === 'asc',
    });
    this.pageIndex.set(0);
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  // ---- Session panel ----

  open(entry: StatEntry): void {
    this.leavePanel(() => this.show(entry));
  }

  private show(entry: StatEntry): void {
    this.creating.set(false);
    this.completing.set(entry);
    this.premarket.set(premarketOf(entry));
    this.session.set(sessionOf(entry));
    this.typedPush = NO_TYPED_PUSH;
    // Both cards open on what is already in : saved at the stat's last update.
    const saved: SaveState = { status: 'saved', at: entry.updatedAt, reason: null };
    this.saveStates.set({ premarket: saved, session: saved });
    this.loadFreePatterns(entry);
  }

  /** Not worth an error banner : without the list, the action simply doesn't show. */
  private loadFreePatterns(entry: StatEntry): void {
    this.freePatterns.set([]);
    this.repo
      .freePatterns(entry.id)
      .pipe(catchError(() => of<Pattern[]>([])))
      .subscribe((patterns) => {
        // The panel may have moved on to another stat while the request was in flight.
        if (this.completing()?.id !== entry.id) return;
        this.freePatterns.set(patterns);
      });
  }

  /**
   * « Same ticker, another pattern » (#507) — confirmed (it creates something), then the new stat
   * opens in the panel with the day's prices already in, like a stat just typed by hand.
   */
  createSibling(): void {
    const source = this.completing();
    const pattern = this.siblingPattern();
    if (!source || !pattern) return;
    const params = {
      ticker: source.ticker,
      pattern: this.translate.instant('patterns.long.' + pattern),
    };
    this.confirm
      .ask('stats.confirmSibling', { params })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.createSibling(source.id, pattern)),
        tap((saved) => {
          this.toasts.success(this.createdMessage(saved, 'sibling', params));
          this.followView(saved);
          this.open(saved);
          this.refetch();
        }),
        catchError((err: unknown) => {
          const key =
            err instanceof HttpErrorResponse && err.status === 409
              ? 'stats.snackbar.siblingConflict'
              : 'stats.snackbar.siblingError';
          this.toasts.error(this.translate.instant(key, params));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  setPremarketPrice(field: PremarketPrice, value: number | null): void {
    this.premarket.update((m) => ({ ...m, [field]: value }));
  }

  setPremarketNote(note: string): void {
    this.premarket.update((m) => ({ ...m, note }));
  }

  setSessionPrice(field: SessionPrice, value: number | null): void {
    this.session.update((m) => ({ ...m, [field]: value, ...markCleared(field, value) }));
  }

  /** A native time input gives `HH:mm`, or an empty string once cleared. */
  setSessionTime(field: SessionTime, value: string): void {
    this.session.update((m) => ({ ...m, [field]: value || null, ...markCleared(field, value) }));
  }

  /** « Sink non relevé » (#729) empties the Sink ; typing one afterwards unticks it. */
  toggleDropNotRead(dropNotRead: boolean): void {
    this.session.update((m) => ({
      ...m,
      dropNotRead,
      ...(dropNotRead
        ? { gusDropPrice: null, gusDropTime: null, dtDropPrice: null, dtDropTime: null }
        : {}),
    }));
    this.saveSession('session');
  }

  toggleFlag(field: 'ssr' | 'highInstitutions', value: boolean): void {
    this.session.update((m) => ({ ...m, [field]: value }));
    this.saveSession('session');
  }

  /** « No push » greys the push field out and empties it ; unticking gives the typed value back. */
  toggleNoPush(noPush: boolean): void {
    const current = this.session();
    if (noPush) this.typedPush = { price: current.pushOpenPrice, time: current.pushOpenTime };
    this.session.set({
      ...current,
      noPush,
      pushOpenPrice: noPush ? null : this.typedPush.price,
      pushOpenTime: noPush ? null : this.typedPush.time,
    });
    this.saveSession('session');
  }

  /**
   * Saves the stat when a field of [card] is left — the whole row goes back, as the backend expects,
   * and [card] shows where the save stands. Nothing is sent while a new stat isn't created yet, when
   * nothing changed, or when the card holds a problem the server would refuse (the card says it). A
   * ticked stat losing a price is refused here, before the backend's 400.
   */
  saveSession(card: SheetCard = 'session'): void {
    const entry = this.completing();
    if (!entry || this.creating()) return;
    const premarket = this.premarket();
    const session = this.session();
    // Every save sends the whole row : a card the server would refuse holds the other one too.
    const premarketIssue = premarketProblem(premarket);
    const sessionIssue = this.sessionIssue()?.reason ?? null;
    const problem =
      card === 'premarket'
        ? (premarketIssue ?? (sessionIssue && 'stats.save.waitingSession'))
        : premarketIssue
          ? 'stats.save.waitingPremarket'
          : sessionIssue;
    if (problem) {
      this.setSaveState(card, { status: 'error', at: null, reason: problem });
      return;
    }
    if (sameSession(session, sessionOf(entry)) && samePremarket(premarket, premarketOf(entry))) {
      // Typed back to what is stored after a refusal (#490) : nothing to send, but the row is
      // saved as it was — a card still reading « non enregistré » would say the work is lost.
      this.clearRefusals(entry.updatedAt);
      return;
    }
    if (entry.completed && missingPrices(session, premarket.pattern, entry.tradeDate).length > 0) {
      this.toasts.error(
        this.translate.instant('stats.snackbar.untickFirst', { ticker: entry.ticker }),
      );
      this.session.set(sessionOf(entry));
      return;
    }
    // Patched right away : the next field left starts from this one, not from the server's reply.
    const input = this.toInput(entry, premarket, session);
    this.patchRow({ ...entry, ...input }, false);
    this.setSaveState(card, { status: 'saving', at: null, reason: null });
    this.enqueue(
      this.repo.update(entry.id, input).pipe(
        tap((saved) => {
          this.patchRow(saved);
          const at = new Date();
          this.setSaveState(card, { status: 'saved', at, reason: null });
          // The request carried the **whole row**, so whatever the other card was holding back for
          // this one has just gone out with it (#348). Its own problems, if any, are left alone.
          this.releaseHeldCard(card === 'premarket' ? 'session' : 'premarket', at);
          // The KPIs only count ticked stats : editing one of them moves them.
          if (saved.completed) this.refreshSummary();
        }),
        catchError(() => {
          this.patchRow(entry, false);
          if (this.completing()?.id === entry.id) {
            this.premarket.set(premarketOf(entry));
            this.session.set(sessionOf(entry));
          }
          this.setSaveState(card, {
            status: 'error',
            at: null,
            reason: 'stats.save.serverRefused',
          });
          this.toasts.error(
            this.translate.instant('stats.snackbar.sessionSaveError', { ticker: entry.ticker }),
          );
          return EMPTY;
        }),
      ),
    );
  }

  /** « saving… », « ✓ saved at 09:42 », « not saved — … » — the label next to a card's title. */
  saveLabel(state: SaveState): string {
    switch (state.status) {
      case 'saving':
        return this.translate.instant('stats.save.saving');
      case 'saved': {
        if (!state.at) return '';
        const time = formatDate(state.at, 'HH:mm', this.locale);
        // Opening a stat shows its last update, often from a previous day (#342).
        if (isToday(state.at)) return this.translate.instant('stats.save.savedAt', { time });
        if (isYesterday(state.at)) {
          return this.translate.instant('stats.save.savedYesterdayAt', { time });
        }
        const date = formatDate(state.at, 'shortDate', this.locale);
        return this.translate.instant('stats.save.savedOnAt', { date, time });
      }
      case 'error':
        return this.translate.instant('stats.save.notSaved', {
          reason: this.translate.instant(state.reason ?? 'stats.save.serverRefused'),
        });
      default:
        return '';
    }
  }

  // ---- New stat (#326) ----

  /** « New stat » — the two cards empty, today's date and the default pattern pre-filled. */
  startNew(): void {
    this.leavePanel(() => this.showNew());
  }

  private showNew(): void {
    this.completing.set(null);
    this.creating.set(true);
    this.identity.set({ tradeDate: this.maxDate(), pattern: DEFAULT_PATTERN, ticker: '' });
    this.premarket.set(BLANK_PREMARKET);
    this.session.set(BLANK_SESSION);
    this.typedPush = NO_TYPED_PUSH;
    this.saveStates.set({ premarket: IDLE, session: IDLE });
  }

  cancelNew(): void {
    this.creating.set(false);
  }

  setIdentity(patch: Partial<IdentityModel>): void {
    this.identity.update((id) => ({ ...id, ...patch }));
  }

  /**
   * « Create the stat » — confirmed (it creates something), then the stat joins the table and its
   * cards go on saving field by field, like any stat's.
   */
  /** A new stat adopts the trades already logged on its day, ticker and pattern (#732) : say so. */
  private createdMessage(
    saved: StatEntry,
    action: 'create' | 'sibling',
    params: Record<string, string>,
  ): string {
    const count = saved.trades.length;
    const suffix = count === 0 ? 'Success' : count === 1 ? 'AttachedOne' : 'Attached';
    return this.translate.instant(`stats.snackbar.${action}${suffix}`, { ...params, count });
  }

  createStat(): void {
    if (!this.creating() || this.createMissing().length > 0) return;
    const id = this.identity();
    const ticker = id.ticker.trim().toUpperCase();
    // The identity goes last : it must win over anything the premarket card carries — the
    // pattern picked in « New stat » included.
    const input: StatEntryInput = {
      ...this.premarketInput(this.premarket(), id.pattern),
      ...this.session(),
      tradeDate: id.tradeDate as Date,
      pattern: id.pattern,
      ticker,
    };
    this.confirm
      .ask('stats.confirmCreate', { params: { ticker } })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.create(input)),
        tap((saved) => {
          this.toasts.success(this.createdMessage(saved, 'create', { ticker }));
          this.followView(saved);
          this.open(saved);
          this.refetch();
        }),
        catchError((err: unknown) => {
          const key =
            err instanceof HttpErrorResponse && err.status === 409
              ? 'stats.snackbar.createConflict'
              : 'stats.snackbar.createError';
          this.toasts.error(this.translate.instant(key, { ticker }));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /** « Missing : date, ticker » — next to « Create the stat » while it can't go. */
  createMissingLabel(): string {
    const fields = this.createMissing().map((key) => this.translate.instant(key));
    return this.translate.instant('stats.completion.missing', { fields: fields.join(', ') });
  }

  /** « Close » — the field being typed is saved on the way out, then the panel stops re-opening. */
  close(): void {
    const current = this.completing();
    if (!current) return;
    const premarketEdited = !samePremarket(this.premarket(), premarketOf(current));
    this.saveSession(premarketEdited ? 'premarket' : 'session');
    this.leavePanel(() => {
      this.dismissed.update((set) => new Set(set).add(current.id));
      this.completing.set(null);
    });
  }

  /**
   * Runs [leave] — straight away, or after « Leave without saving? » when the panel holds edits a
   * validation kept from saving. Leaving drops them : the row still holds the last saved values.
   */
  private leavePanel(leave: () => void): void {
    if (!this.hasPendingEdits()) {
      leave();
      return;
    }
    this.confirm
      .ask('stats.confirmLeave', { variant: 'danger' })
      .pipe(filter(Boolean))
      .subscribe(() => leave());
  }

  /**
   * The ✓ — ticks the stat as completed, or unticks it back to "to complete". Ticking needs the five
   * prices (four on a no-push day, the four of a double top) : the button is disabled without them,
   * and the backend refuses it too. The list reloads, since the status filter and the KPIs both
   * depend on it.
   */
  toggleCompleted(entry: StatEntry): void {
    const completed = !entry.completed;
    if (completed && !countsInFigures(entry)) return;
    if (completed && missingPrices(entry, entry.pattern, entry.tradeDate).length > 0) return;
    this.enqueue(
      this.repo.setCompleted(entry.id, completed).pipe(
        tap((saved) => {
          this.patchRow(saved);
          this.refetch();
        }),
        catchError(() => {
          this.toasts.error(
            this.translate.instant('stats.snackbar.completionError', { ticker: entry.ticker }),
          );
          return EMPTY;
        }),
      ),
    );
  }

  /**
   * Why the ✓ can't tick the open stat — a missing price, or a set the day's range refuses (#305).
   * Empty when nothing stands in the way, which is also what disables the button.
   */
  tickBlockedReason(): string {
    const open = this.completing();
    if (open && !countsInFigures(open)) return this.translate.instant('stats.review.tickBlocked');
    if (this.sessionMissing().length > 0) {
      return this.missingLabel(this.sessionMissing());
    }
    const issue = this.sessionIssue();
    return issue ? this.translate.instant(issue.reason) : '';
  }

  /** The same answer for a row of the table, which has no panel model to read. */
  rowBlockedReason(row: StatRow): string {
    if (!countsInFigures(row)) return this.translate.instant('stats.review.tickBlocked');
    if (row.missing.length > 0) return this.missingLabel(row.missing);
    return row.issue ? this.translate.instant(row.issue) : '';
  }

  /** « Il manque HOD, EOD » — the ✓'s tooltip while it can't tick. */
  missingLabel(missing: readonly string[]): string {
    const fields = missing.map((key) => this.translate.instant(key));
    return this.translate.instant('stats.completion.missing', { fields: fields.join(', ') });
  }

  // ---- Row actions ----

  /**
   * « → Trade » / « + » (#193, #500) — confirmed, then the backend creates the stat's next trade and
   * we land straight on its page : the point of the action is to go and type the executions.
   */
  promoteToTrade(entry: StatEntry): void {
    const key = entry.trades.length > 0 ? 'stats.confirmAnotherTrade' : 'stats.confirmPromoteTrade';
    this.confirm
      .ask(key, { params: { ticker: entry.ticker } })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.promoteToTrade(entry.id)),
        tap((trade) => {
          this.toasts.success(
            this.translate.instant('stats.snackbar.promoteTradeSuccess', { ticker: entry.ticker }),
          );
          void this.router.navigate(['/journal', trade.id]);
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('stats.snackbar.promoteTradeError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /**
   * A stat with trades is deleted too (#635) : its trades stay in the journal, unlinked — the
   * confirmation says how many, since their sheet loses its day context.
   */
  delete(entry: StatEntry): void {
    const count = entry.trades.length;
    const key =
      count === 0
        ? 'stats.confirmDelete'
        : count === 1
          ? 'stats.confirmDeleteWithTrade'
          : 'stats.confirmDeleteWithTrades';
    this.confirm
      .ask(key, { params: { ticker: entry.ticker, count }, variant: 'danger' })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.delete(entry.id)),
        tap(() => {
          this.toasts.success(
            this.translate.instant('stats.snackbar.deleteSuccess', { ticker: entry.ticker }),
          );
          if (this.completing()?.id === entry.id) this.completing.set(null);
          // Even when the page steps back : only the listing is keyed on it, and the KPIs counted
          // the deleted stat too.
          this.refetch();
          // Deleting the last row of a non-zero page would strand the user on an empty page.
          if (this.entries().length === 1 && this.pageIndex() > 0) {
            this.pageIndex.update((n) => n - 1);
          }
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('stats.snackbar.deleteError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  // ---- Review of a scanner stat (#764) ----

  /** Exposed to the template : the rows and the panel ask the same question. */
  readonly countsInFigures = countsInFigures;

  /** « Valider » — an edit, no confirmation : the stat joins the figures, to complete. */
  validate(entry: StatEntry): void {
    this.changeReview(entry, this.repo.validate(entry.id), 'validate');
  }

  /** « Rétablir » a rejected stat, « Repasser à relire » a validated one — both back to review. */
  restore(entry: StatEntry): void {
    this.changeReview(entry, this.repo.restore(entry.id), 'restore');
  }

  /**
   * « Rejeter » — confirmed (danger), with an optional reason of the stat's pattern. Its panel
   * closes : a rejected stat leaves the table but under « Rejetées ».
   */
  reject(entry: StatEntry): void {
    const reasons = REJECTION_REASONS[entry.pattern as StatPattern] ?? [];
    this.confirm
      .choose('stats.confirmReject', reasons, 'stats.rejectionReason', {
        params: { ticker: entry.ticker },
        variant: 'danger',
        icon: 'close',
        noteMaxLength: REJECTION_NOTE_MAX_LENGTH,
      })
      .pipe(filter((pick): pick is Extract<StbConfirmPick, { confirmed: true }> => pick.confirmed))
      .subscribe((pick) => {
        if (this.completing()?.id === entry.id) this.completing.set(null);
        const reason = pick.value as StatRejectionReason | null;
        this.changeReview(entry, this.repo.reject(entry.id, reason, pick.note), 'reject');
      });
  }

  /** The scanner's tag of a row : its state, and a rejection's reason. */
  reviewTag(entry: StatEntry): string {
    if (entry.review === 'REJECTED' && entry.rejectionReason) {
      const reason = this.translate.instant('stats.rejectionReasonShort.' + entry.rejectionReason);
      return this.translate.instant('stats.review.tag.REJECTED_BECAUSE', { reason });
    }
    return this.translate.instant('stats.review.tag.' + (entry.review ?? 'VALIDATED'));
  }

  reviewTagHint(entry: StatEntry): string {
    if (entry.review === 'REJECTED' && entry.rejectionNote) {
      return this.translate.instant('stats.review.note', { note: entry.rejectionNote });
    }
    return this.translate.instant('stats.review.tagHint.' + (entry.review ?? 'VALIDATED'), {
      created: formatDate(entry.createdAt, 'short', this.locale),
    });
  }

  /** A rejected stat's banner : why it was rejected, when a reason was given. */
  rejectedBanner(entry: StatEntry): string {
    if (!entry.rejectionReason) return this.translate.instant('stats.review.bannerRejected');
    const reason = this.translate.instant('stats.rejectionReason.' + entry.rejectionReason);
    return this.translate.instant('stats.review.bannerRejectedBecause', { reason });
  }

  /** When the scanner dropped the stat, and the session it read it on — the panel's banner. */
  reviewBannerParams(entry: StatEntry): Record<string, string> {
    return {
      created: formatDate(entry.createdAt, 'short', this.locale),
      day: formatDate(entry.tradeDate, 'fullDate', this.locale),
    };
  }

  /**
   * Through the write queue, so a field left right before the click is saved first. The listing
   * and the KPIs reload : the stat moves between tabs and in or out of the figures.
   */
  private changeReview(
    entry: StatEntry,
    write: Observable<StatEntry>,
    action: 'validate' | 'reject' | 'restore',
  ): void {
    const params = { ticker: entry.ticker };
    this.enqueue(
      write.pipe(
        tap((saved) => {
          this.patchRow(saved);
          this.toasts.success(this.translate.instant(`stats.snackbar.${action}Success`, params));
          this.refetch();
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant(`stats.snackbar.${action}Error`, params));
          return EMPTY;
        }),
      ),
    );
  }

  // ---- Internals ----

  /**
   * Moves to the view a stat shows in when it is opened from a link or just created — typing into a
   * stat whose row the table doesn't show is how a price lands on the wrong ticker. « All » shows
   * them all. The next listing keeps the panel, even when the stat sits off its first page.
   */
  private followView(entry: StatEntry): void {
    const view = viewOf(entry.pattern);
    if (this.view() === 'ALL' || this.view() === view) return;
    this.keepPanelOnNextLoad = true;
    this.setView(view);
  }

  /** A page just landed : the panel follows it — closed if its stat left, opened on a pending one. */
  private listed(rows: StatEntry[]): void {
    const keepPanel = this.keepPanelOnNextLoad;
    this.keepPanelOnNextLoad = false;
    if (!keepPanel) this.closeOffScreen(rows);
    this.autoOpenPending(rows);
  }

  /**
   * Closes the panel when a filter, a page or a sort took its stat off the table (#383) — typing
   * into a row that isn't on screen is how a price lands on the wrong ticker. It doesn't ask : an
   * edit the validation held back could never be saved anyway, so it is dropped and a toast says so.
   */
  private closeOffScreen(rows: StatEntry[]): void {
    const current = this.completing();
    if (!current || rows.some((s) => s.id === current.id)) return;
    if (this.hasPendingEdits()) {
      this.toasts.error(
        this.translate.instant('stats.snackbar.editDropped', { ticker: current.ticker }),
      );
    }
    this.completing.set(null);
  }

  /**
   * Opens the session panel on the first stat of the page still to complete. Stats closed during
   * this visit are skipped, and an open panel is never replaced. A scanner stat to review or
   * rejected is not to complete : it waits for « Relire » (#764).
   */
  private autoOpenPending(rows: StatEntry[]): void {
    if (this.completing() || this.creating()) return;
    const pending = rows.find(
      (s) => !s.completed && countsInFigures(s) && !this.dismissed().has(s.id),
    );
    if (pending) this.open(pending);
  }

  private enqueue(write: Observable<unknown>): void {
    this.writes.next(write);
  }

  /**
   * Replaces a row of the page — and the panel's stat when it is that one — with [entry]. While a
   * page loads, writing the resource would cancel that load, and its GET may predate the save :
   * the page is asked again instead, so the row and the panel end up agreeing — once the server
   * has [answered] only. Before the save goes out, or put back after it failed, a reload would
   * read nothing newer than the load already running.
   */
  private patchRow(entry: StatEntry, answered = true): void {
    if (this.listing.isLoading()) {
      if (answered) {
        this.keepPanelOnNextLoad = true;
        this.listingWrites.update((n) => n + 1);
      }
    } else {
      this.listing.value.update(
        (page) =>
          page && {
            ...page,
            content: page.content.map((s) => (s.id === entry.id ? entry : s)),
          },
      );
    }
    if (this.completing()?.id === entry.id) this.completing.set(entry);
  }

  private refreshSummary(): void {
    this.kpiWrites.update((n) => n + 1);
  }

  private refetch(): void {
    this.keepPanelOnNextLoad = true;
    this.listingWrites.update((n) => n + 1);
    this.refreshSummary();
  }

  /**
   * Clears a card left waiting on the one that just saved — and only that : a card blocked on a
   * problem of its own (a HOD under the LOD) keeps its error, since nothing solved it.
   */
  private releaseHeldCard(card: SheetCard, at: Date): void {
    const state = this.saveStates()[card];
    const held = state.status === 'error' && HELD_REASONS.includes(state.reason ?? '');
    if (held) this.setSaveState(card, { status: 'saved', at, reason: null });
  }

  /** Every card left on a refusal reads saved again, at the stat's last write. */
  private clearRefusals(at: Date): void {
    for (const card of ['premarket', 'session'] as const) {
      if (this.saveStates()[card].status === 'error') {
        this.setSaveState(card, { status: 'saved', at, reason: null });
      }
    }
  }

  private setSaveState(card: SheetCard, state: SaveState): void {
    this.saveStates.update((states) => ({ ...states, [card]: state }));
  }

  /**
   * The panel sends the whole row back — date and ticker untouched ; premarket (pattern included),
   * session and flags as typed.
   */
  private toInput(
    entry: StatEntry,
    premarket: PremarketModel,
    session: SessionModel,
  ): StatEntryInput {
    return {
      tradeDate: entry.tradeDate,
      pattern: premarket.pattern,
      ticker: entry.ticker,
      ...this.premarketInput(premarket, premarket.pattern),
      ...session,
    };
  }

  /**
   * The premarket card as the API takes it — its three prices are checked before this is called,
   * and a double top sends none (#649).
   */
  private premarketInput(m: PremarketModel, pattern: Pattern) {
    const doubleTop = pattern === 'DT';
    return {
      previousClose: doubleTop ? null : m.previousClose,
      pmOpen: doubleTop ? null : m.pmOpen,
      pmHigh: doubleTop ? null : m.pmHigh,
      floatMillions: m.floatMillions,
      volumeMillions: m.volumeMillions,
      note: m.note.trim() || null,
    };
  }
}

function samePremarket(a: PremarketModel, b: PremarketModel): boolean {
  return (Object.keys(a) as (keyof PremarketModel)[]).every((key) => a[key] === b[key]);
}

function sameSession(a: SessionModel, b: SessionModel): boolean {
  return (Object.keys(a) as (keyof SessionModel)[]).every((key) => a[key] === b[key]);
}
