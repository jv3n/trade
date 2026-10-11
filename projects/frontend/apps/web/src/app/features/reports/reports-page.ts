import { DecimalPipe, formatDate, formatNumber } from '@angular/common';
import { Component, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BarBucket,
  BarSeries,
  BarTone,
  StbBarChart,
  StbButtonModule,
  StbButtonToggleModule,
  StbCardModule,
  StbIconModule,
  StbProgressSpinnerModule,
  StbSkeletonCard,
  StbSkeletonKpiRow,
  StbTabsModule,
  stbLoadGate,
} from '@portfolioai/ui';
import { getQuarter } from 'date-fns';
import {
  AccountMovementType,
  CashFlow,
  CashFlowBucket,
  CashFlowBucketSize,
} from '../../core/api/account/account.model';
import { AccountRepository } from '../../core/api/account/account.repository';
import { keptValue, lastLoadFailed } from '../../shared/kept-value/kept-value';
import { PeriodFilter } from '../../shared/period-filter/period-filter';
import {
  PeriodSelection,
  computePeriodRange,
  selectPeriod,
} from '../../shared/period-preset/period-preset';
import {
  BUCKET_SIZES,
  FlowSeriesKey,
  REPORT_TYPES,
  TRADING_ONLY,
  breakdown,
  bucketSizeAllowed,
  defaultBucketSize,
  fittingBucketSize,
  nothingMoved,
  seriesKeys,
  seriesValues,
  totals,
} from './cash-flow';

/** Where the chips last chosen are kept — a per-browser habit, not a setting (#685). */
const TYPES_KEY = 'reports.cashFlow.types';

const TONES: Record<FlowSeriesKey, BarTone> = {
  winning: 'gain',
  losing: 'loss',
  fees: 'cost',
  deposits: 'neutral',
  withdrawals: 'neutral',
};

/**
 * « Rapports », tab « Flux du compte » (#685) : what went in and out of the account, bar by bar,
 * over a period. Reads the ledger as it stands — nothing here is recorded.
 *
 * The period, the bar size and the type chips key one load ; a change keeps the previous chart on
 * screen until the next answer (`keptValue`), and only the first load shows a skeleton. The chips
 * filter the chart, the KPI row and the breakdown together — the balance tile excepted, a balance
 * being the whole account's.
 */
@Component({
  selector: 'app-reports-page',
  imports: [
    DecimalPipe,
    PeriodFilter,
    StbBarChart,
    StbButtonModule,
    StbButtonToggleModule,
    StbCardModule,
    StbIconModule,
    StbProgressSpinnerModule,
    StbSkeletonCard,
    StbSkeletonKpiRow,
    StbTabsModule,
    TranslatePipe,
  ],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPage {
  private readonly repo = inject(AccountRepository);
  private readonly translate = inject(TranslateService);
  private readonly locale = inject(LOCALE_ID);

  readonly bucketSizes = BUCKET_SIZES;
  readonly reportTypes = REPORT_TYPES;

  readonly selection = signal<PeriodSelection>({
    period: 'last3Months',
    ...computePeriodRange('last3Months'),
  });
  /** The page opens on the whole account ; the chips last chosen come back (#685). */
  readonly types = signal<readonly AccountMovementType[]>(readStoredTypes());
  readonly tradingOnly = computed(() => sameTypes(this.types(), TRADING_ONLY));
  /** Bumped by « Réessayer » : a new key, where `reload()` is a no-op while a load runs. */
  private readonly retries = signal(0);

  /** « Toutes périodes » has no dates : its span is read from a yearly answer, to know the sizes. */
  private readonly allTimeResource = rxResource({
    params: () => (this.selection().period === 'all' ? { retry: this.retries() } : undefined),
    stream: () => this.repo.getCashFlow({ dateFrom: null, dateTo: null, types: null }, 'YEAR'),
  });
  private readonly span = computed(() => {
    const { period, dateFrom, dateTo } = this.selection();
    if (period !== 'all') return { from: dateFrom, to: dateTo };
    const all = this.allTimeResource.hasValue() ? this.allTimeResource.value() : undefined;
    return { from: all?.dateFrom ?? null, to: all?.dateTo ?? null };
  });

  /**
   * False on « Toutes périodes » until the yearly answer says how long the history is : until then
   * no size can be judged, and a narrow one clicked in that window would reach the endpoint's
   * 400-bar refusal (#701 review).
   */
  readonly spanKnown = computed(
    () => this.selection().period !== 'all' || this.allTimeResource.hasValue(),
  );

  /**
   * The size picked by hand, kept across period changes ; null until the toggle is used, the period
   * choosing meanwhile (PARCOURS, « Flux du compte »).
   */
  readonly chosenSize = signal<CashFlowBucketSize | null>(null);
  /** What the page would draw : the hand-picked size, or the period's default. */
  private readonly preferredSize = computed(() => {
    const { period, dateFrom, dateTo } = this.selection();
    return this.chosenSize() ?? defaultBucketSize(period, dateFrom, dateTo);
  });
  readonly bucketSize = computed(() =>
    // A choice that does not fit this period shows the nearest one that does, and comes back with
    // a period it fits.
    fittingBucketSize(this.preferredSize(), this.span().from, this.span().to),
  );

  private readonly flowResource = rxResource({
    params: () => ({
      dateFrom: this.selection().dateFrom,
      dateTo: this.selection().dateTo,
      types: this.types(),
      groupBy: this.bucketSize(),
      retry: this.retries(),
    }),
    stream: ({ params }) =>
      this.repo.getCashFlow(
        { dateFrom: params.dateFrom, dateTo: params.dateTo, types: params.types },
        params.groupBy,
      ),
  });
  readonly flow = keptValue(this.flowResource);
  readonly failed = lastLoadFailed(this.flowResource);
  readonly loading = this.flowResource.isLoading;
  /** First load only (#539) : a filter change keeps the previous chart on screen. */
  readonly gate = stbLoadGate(this.loading);

  readonly empty = computed(() => {
    const f = this.flow();
    return f !== null && (f.buckets.length === 0 || nothingMoved(f.buckets));
  });
  readonly totals = computed(() => totals(this.flow()?.buckets ?? []));
  /** Trades + locates — what the trading did, its costs included. */
  readonly tradingResult = computed(() => {
    const t = this.totals();
    return t.winningTrades + t.losingTrades + t.locates;
  });
  readonly showsTrading = computed(() => this.types().some((t) => TRADING_ONLY.includes(t)));
  readonly showsCash = computed(() =>
    this.types().some((t) => t === 'DEPOSIT' || t === 'WITHDRAWAL'),
  );
  readonly breakdown = computed(() => breakdown(this.totals(), this.types()));

  readonly chartSeries = computed<BarSeries[]>(() =>
    seriesKeys(this.types()).map((key) => ({
      key,
      label: this.translate.instant(this.seriesLabelKey(key)),
      tone: TONES[key],
    })),
  );
  readonly chartBuckets = computed<BarBucket[]>(() =>
    (this.flow()?.buckets ?? []).map((b) => ({
      label: this.bucketLabel(b),
      title: this.bucketTitle(b),
      values: seriesValues(b),
    })),
  );
  /** Signed, the account's currency suffix, the interface's locale. */
  readonly formatAmount = (value: number): string =>
    `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value), this.locale, '1.2-2')}${this.translate.instant('account.usdSuffix')}`;

  setSelection(selection: PeriodSelection): void {
    this.selection.set(selection);
  }

  showAllTime(): void {
    this.selection.set(selectPeriod('all', this.selection()));
  }

  sizeAllowed(size: CashFlowBucketSize): boolean {
    return this.spanKnown() && bucketSizeAllowed(size, this.span().from, this.span().to);
  }

  setTypes(types: readonly AccountMovementType[]): void {
    // At least one type : with none, the chart would answer a question nobody asked. A fresh array
    // brings the toggle back to the kept selection.
    this.storeTypes(
      types.length ? REPORT_TYPES.filter((t) => types.includes(t)) : [...this.types()],
    );
  }

  toggleTradingOnly(): void {
    this.storeTypes(this.tradingOnly() ? REPORT_TYPES : TRADING_ONLY);
  }

  retry(): void {
    this.retries.update((n) => n + 1);
  }

  /** The balance tile's label : the period's last day, as the answer resolved it. */
  closingDate(flow: CashFlow): string {
    return flow.dateTo ? formatDate(flow.dateTo, 'shortDate', this.locale) : '';
  }

  openingDate(flow: CashFlow): string {
    return flow.dateFrom ? formatDate(flow.dateFrom, 'shortDate', this.locale) : '';
  }

  private storeTypes(types: readonly AccountMovementType[]): void {
    this.types.set(types);
    try {
      localStorage.setItem(TYPES_KEY, JSON.stringify(types));
    } catch {
      // Blocked storage : the choice lasts the page.
    }
  }

  private seriesLabelKey(key: FlowSeriesKey): string {
    if (key !== 'fees') return `reports.flow.series.${key}`;
    const types = this.types();
    if (!types.includes('ADJUSTMENT')) return 'reports.flow.series.locates';
    if (!types.includes('LOCATE')) return 'reports.flow.series.adjustments';
    return 'reports.flow.series.fees';
  }

  private bucketLabel(b: CashFlowBucket): string {
    switch (this.bucketSize()) {
      case 'DAY':
      case 'WEEK':
        return formatDate(b.from, 'dd/MM', this.locale);
      case 'MONTH':
        return formatDate(b.from, 'MMM y', this.locale);
      case 'QUARTER':
        return this.quarter(b.from);
      case 'YEAR':
        return formatDate(b.from, 'y', this.locale);
    }
  }

  private bucketTitle(b: CashFlowBucket): string {
    switch (this.bucketSize()) {
      case 'DAY':
        return formatDate(b.from, 'fullDate', this.locale);
      case 'WEEK':
        return this.translate.instant('reports.flow.weekOf', {
          from: formatDate(b.from, 'dd/MM', this.locale),
          to: formatDate(b.to, 'dd/MM', this.locale),
        });
      case 'MONTH':
        return formatDate(b.from, 'MMMM y', this.locale);
      case 'QUARTER':
        return this.quarter(b.from);
      case 'YEAR':
        return formatDate(b.from, 'y', this.locale);
    }
  }

  private quarter(date: Date): string {
    return this.translate.instant('reports.flow.quarter', {
      quarter: getQuarter(date),
      year: date.getFullYear(),
    });
  }
}

function sameTypes(a: readonly AccountMovementType[], b: readonly AccountMovementType[]): boolean {
  return a.length === b.length && a.every((t) => b.includes(t));
}

/** The chips last chosen, when they still make sense ; every type otherwise. */
function readStoredTypes(): readonly AccountMovementType[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(TYPES_KEY) ?? 'null');
    if (Array.isArray(stored)) {
      const types = REPORT_TYPES.filter((t) => stored.includes(t));
      if (types.length) return types;
    }
  } catch {
    // Blocked or garbled storage : the default.
  }
  return REPORT_TYPES;
}
