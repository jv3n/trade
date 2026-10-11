import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AreaChartPoint,
  MatDialog,
  PageEvent,
  StbAreaChart,
  StbButtonModule,
  StbButtonToggleModule,
  StbCardModule,
  StbChipsModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbPaginatorModule,
  StbProgressSpinnerModule,
  StbSelectModule,
  StbSkeletonKpiRow,
  StbSkeletonTable,
  StbTableModule,
  StbToast,
  StbTooltipModule,
  stbLoadGate,
} from '@portfolioai/ui';
import { format } from 'date-fns';
import { EMPTY, Observable, catchError, filter, switchMap, tap } from 'rxjs';
import {
  AccountMovement,
  AccountMovementFilter,
  AccountMovementInput,
  AccountMovementType,
  AccountSummary,
  BalancePoint,
} from '../../core/api/account/account.model';
import { AccountRepository } from '../../core/api/account/account.repository';
import { ForexRepository } from '../../core/api/forex/forex.repository';
import { LocateInput } from '../../core/api/locates/locates.model';
import { LocatesRepository } from '../../core/api/locates/locates.repository';
import {
  BalanceCurrency,
  BalanceCurrencyService,
} from '../../core/app-state/balance-currency.service';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { keptValue, lastLoadFailed } from '../../shared/kept-value/kept-value';
import { PeriodFilter } from '../../shared/period-filter/period-filter';
import {
  PeriodPresetKey,
  PeriodSelection,
  computePeriodRange,
} from '../../shared/period-preset/period-preset';
import { PluralPipe } from '../../shared/plural/plural';
import {
  skeletonHeaderKeys,
  toSkeletonColumns,
  type SkeletonColumnDefs,
} from '../../shared/skeleton-columns/skeleton-columns';
import { NewLocateDialog } from '../locates/new-locate-dialog/new-locate-dialog';
import { MorningReconciliation } from './morning-reconciliation/morning-reconciliation';
import { MovementDialog, MovementDialogData } from './movement-dialog/movement-dialog';

/**
 * The type filter as the user reads it. `cash` groups deposits and withdrawals : from the ledger's
 * point of view they are the same question — money I put in or took out — and the mockup offers
 * them as one choice.
 */
export type MovementTypeFilter = 'all' | 'trades' | 'cash' | 'corrections' | 'locates';

export const MOVEMENT_TYPE_FILTERS: readonly MovementTypeFilter[] = [
  'all',
  'trades',
  'cash',
  'corrections',
  'locates',
];

const TYPES_BY_FILTER: Record<MovementTypeFilter, readonly AccountMovementType[] | null> = {
  all: null,
  trades: ['TRADE'],
  cash: ['DEPOSIT', 'WITHDRAWAL'],
  corrections: ['ADJUSTMENT'],
  locates: ['LOCATE'],
};

/** The period's locates as the tile reads them, unsigned — the label carries the direction. */
export interface PeriodLocates {
  total: number;
  /** On a ticker with no trade that day — what the discipline costs. */
  paidForNothing: number;
}

/**
 * The gaps the period's reconciled mornings recorded, as the tile reads them. [amount] is unsigned
 * — the label carries the direction ; [credit] flags a period the broker ended up paying into.
 * [share] is the percentage of the period's P&L, null when it would mislead (a flat or losing
 * period, a credit).
 */
export interface ReconciliationGap {
  amount: number;
  credit: boolean;
  share: number | null;
}

/** What the filter toolbar holds. The preset is UI-only — only the resolved dates reach the API. */
interface AccountFilter {
  period: PeriodPresetKey;
  dateFrom: Date | null;
  dateTo: Date | null;
  type: MovementTypeFilter;
}

/** Same day, or both open : a type change keeps the period, and must not reload the tiles. */
function samePeriod(
  a: { dateFrom: Date | null; dateTo: Date | null },
  b: { dateFrom: Date | null; dateTo: Date | null },
): boolean {
  return (
    a.dateFrom?.getTime() === b.dateFrom?.getTime() && a.dateTo?.getTime() === b.dateTo?.getTime()
  );
}

/** The movements table as its skeleton shows it (#539). */
const SKELETON_COLUMNS: SkeletonColumnDefs = {
  valueDate: { key: 'account.fields.valueDate' },
  type: { key: 'account.fields.type' },
  label: { key: 'account.fields.label' },
  amount: { key: 'account.fields.amount', unitKey: 'account.usdUnit', variant: 'numeric' },
  balanceAfter: {
    key: 'account.fields.balanceAfter',
    unitKey: 'account.usdUnit',
    variant: 'numeric',
  },
  actions: { variant: 'actions' },
};

/**
 * Broker cash-account page, laid out after `mockup/compte.html` (#229) : a KPI row (balance with
 * its USD / CAD switch, P&L of the period, net injected), the balance curve in its own card, and
 * the movements as a filterable table carrying the running balance. Locates (#608, #625) : a
 * « Locate » button for a new one, LOCATE lines that delete their locate, and a tile for the
 * period's locates with their part paid for nothing.
 *
 * **The period drives the page, the type only the table.** The period feeds `/summary`, the chart
 * window and `/movements` ; the type filter narrows the movements table and nothing else. The KPI
 * tiles describe the period — its P&L, the cash injected, the reconciliation gaps — not the rows
 * picked below them : fed by the table's type, « Trades » read 0 of net injected and « Dépôts /
 * retraits » a P&L of 0 (#488). The filter mirrors the journal's, presets included, and only
 * resolved dates travel to the backend.
 *
 * The balance column comes from the server (`balanceAfter`), never recomputed here : it is defined
 * over the whole history, so filtering to trades must not renumber it.
 *
 * The summary, the series and the movements are resources, each able to fail on its own (#493) :
 * the summary keyed on the period's dates, the movements on the whole filter and the page, the
 * series on nothing — it is the whole history, clipped here. Every mutation refetches the three —
 * the dataset is small, so we trust the server rather than splicing locally.
 */
@Component({
  selector: 'app-account-page',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    StbAreaChart,
    StbButtonModule,
    StbButtonToggleModule,
    StbCardModule,
    StbChipsModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbPaginatorModule,
    StbProgressSpinnerModule,
    StbSelectModule,
    StbTableModule,
    StbTooltipModule,
    MorningReconciliation,
    PeriodFilter,
    PluralPipe,
    TranslatePipe,
    StbSkeletonTable,
    StbSkeletonKpiRow,
  ],
  templateUrl: './account-page.html',
  styleUrl: './account-page.scss',
})
export class AccountPage {
  private readonly repo = inject(AccountRepository);
  private readonly locates = inject(LocatesRepository);
  private readonly forex = inject(ForexRepository);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(StbToast);

  /**
   * Defaults to the running month's trades — what the page is opened for (#473, #629) ; locates,
   * deposits and corrections have their own filters, and the KPI tiles keep counting them.
   */
  readonly appliedFilter = signal<AccountFilter>({
    period: 'thisMonth',
    ...computePeriodRange('thisMonth'),
    type: 'trades',
  });

  readonly pageIndex = signal(0);
  readonly pageSize = signal(25);
  /**
   * Bumped by a write, and part of every resource's params : a new key supersedes a load in flight,
   * where `reload()` is a no-op while one runs — its pre-write answer would win.
   */
  private readonly writes = signal(0);
  private readonly period = computed(
    () => {
      const { dateFrom, dateTo } = this.appliedFilter();
      return { dateFrom, dateTo };
    },
    { equal: samePeriod },
  );
  private readonly summaryResource = rxResource({
    params: () => ({ ...this.period(), writes: this.writes() }),
    stream: ({ params: { dateFrom, dateTo } }) =>
      this.repo.getSummary({ dateFrom, dateTo, types: null }),
  });
  /**
   * The whole series, always : the chart is clipped client-side, so changing the window doesn't
   * cost a round-trip and the curve keeps its shape when the user flips between presets.
   */
  private readonly seriesResource = rxResource({
    params: () => ({ writes: this.writes() }),
    stream: () => this.repo.getBalanceSeries(),
  });
  private readonly movementsResource = rxResource({
    params: () => ({
      filter: this.toApiFilter(),
      page: { pageIndex: this.pageIndex(), pageSize: this.pageSize() },
      writes: this.writes(),
    }),
    stream: ({ params }) => this.repo.findMovements(params.filter, params.page),
  });
  readonly loading = this.movementsResource.isLoading;

  /** First load only (#539) : a refetch keeps the content on screen. */
  readonly gate = stbLoadGate(this.loading);
  private readonly headerLabels = toSignal(
    this.translate.stream(skeletonHeaderKeys(SKELETON_COLUMNS)) as Observable<
      Record<string, string>
    >,
    { initialValue: {} },
  );
  readonly skeletonColumns = computed(() =>
    toSkeletonColumns(this.displayedColumns, SKELETON_COLUMNS, this.headerLabels()),
  );
  /**
   * Each call clears its failure on its next success, so the banner stays while anything is still
   * missing and goes once everything loaded again (#493). What a failed call feeds reads
   * « unavailable » rather than its previous figure.
   */
  readonly summaryFailed = lastLoadFailed(this.summaryResource);
  readonly seriesFailed = lastLoadFailed(this.seriesResource);
  readonly movementsFailed = lastLoadFailed(this.movementsResource);
  readonly loadFailed = computed(
    () => this.summaryFailed() || this.seriesFailed() || this.movementsFailed(),
  );
  /** A failed call is being tried again — the banner's « Retry » shows it is at work. */
  readonly retrying = computed(
    () =>
      (this.summaryFailed() && this.summaryResource.isLoading()) ||
      (this.seriesFailed() && this.seriesResource.isLoading()) ||
      (this.movementsFailed() && this.movementsResource.isLoading()),
  );
  /**
   * The balance the morning reconciliation measures against — null while the summary is missing :
   * a gap taken against a stale balance would write a wrong correction.
   */
  readonly appBalance = computed(() =>
    this.summaryFailed() ? null : (this.summary()?.balance ?? null),
  );
  readonly unavailableKpis = [
    'account.currentBalance',
    'account.kpi.periodPnl',
    'account.kpi.netInjected',
    'account.kpi.reconciliationGap',
    'account.kpi.locates',
  ] as const;
  /** The period's figures, over its dates only — never narrowed by the table's type filter. */
  readonly summary = keptValue(this.summaryResource);
  private readonly page = keptValue(this.movementsResource);
  readonly movements = computed<AccountMovement[]>(() => this.page()?.content ?? []);
  readonly totalElements = computed(() => this.page()?.totalElements ?? 0);
  readonly series = computed<BalancePoint[]>(() => this.keptSeries() ?? []);
  private readonly keptSeries = keptValue(this.seriesResource);

  /** Today, captured once so the header date doesn't re-evaluate on every change detection. */
  readonly today = new Date();

  readonly typeFilters = MOVEMENT_TYPE_FILTERS;

  readonly displayedColumns = ['valueDate', 'type', 'label', 'amount', 'balanceAfter', 'actions'];

  /**
   * USD→other-currency rate for the hero toggle ; null until loaded, or if the lookup failed — then
   * the CAD toggle stays disabled and the balance keeps showing USD, no banner for a cosmetic
   * feature. Loaded once : the figure is cached ~6 h backend-side.
   */
  private readonly rateResource = rxResource({ stream: () => this.forex.latestRate() });
  readonly rate = computed(() => (this.rateResource.hasValue() ? this.rateResource.value() : null));

  /**
   * The display currency is a **user preference** since #201 : toggling it here writes it on the
   * account, so the choice survives the visit and matches what Settings › Preferences shows. The
   * account stays USD-denominated — CAD converts the hero balance only.
   */
  private readonly balanceCurrency = inject(BalanceCurrencyService);
  readonly currencies = this.balanceCurrency.supported;
  readonly currency = this.balanceCurrency.currency;

  /**
   * Series clipped to the active period, mapped for the chart (x = epoch ms, label = date).
   * Converted like the hero balance : a CAD hero above a USD curve reads as a broken account.
   */
  readonly chartPoints = computed<AreaChartPoint[]>(() =>
    this.clippedSeries().map((p) => ({
      x: p.date.getTime(),
      y: this.convert(p.balance),
      label: format(p.date, 'd MMM yyyy'),
    })),
  );

  /** The span the curve actually covers — the card's subtitle, « 31/08 → 17/09 » in the mockup. */
  readonly chartRange = computed<{ from: Date; to: Date } | null>(() => {
    const pts = this.clippedSeries();
    return pts.length ? { from: pts[0].date, to: pts[pts.length - 1].date } : null;
  });

  readonly reconciliationGap = computed<ReconciliationGap | null>(() => {
    const s = this.summary();
    // No reconciled morning in the period : nothing was measured, the tile reads « — » (#480, #687).
    if (!s || s.periodReconciliationGap === null) return null;
    // A gap is negative when the broker took money : a positive sum is a credit.
    const credit = s.periodReconciliationGap > 0;
    const amount = Math.abs(s.periodReconciliationGap);
    return {
      amount,
      credit,
      share: !credit && s.periodPnl > 0 ? (amount / s.periodPnl) * 100 : null,
    };
  });

  /**
   * A 0 when nothing was located, unlike the gap's « — » : a period with nothing located measured
   * 0, it did not miss a measure.
   */
  locatesOf(s: AccountSummary): PeriodLocates {
    return { total: Math.abs(s.periodLocates), paidForNothing: Math.abs(s.periodUnusedLocates) };
  }

  /**
   * The suffix key of the displayed currency — tells the two dollars apart, since both use the same
   * sign. Through i18n like every other amount (#395) : the locale's own form, and a no-break space
   * so the currency never wraps away from the balance.
   */
  readonly currencySuffixKey = computed(() =>
    this.currency() === 'CAD' ? 'account.cadSuffix' : 'account.usdSuffix',
  );

  openAdd(): void {
    this.openMovementDialog(null);
  }

  edit(movement: AccountMovement): void {
    this.openMovementDialog(movement);
  }

  /**
   * Where a TRADE row points : its own trade page when the link is there (#197), the journal
   * listing otherwise — an old movement whose trade is gone still has to lead somewhere.
   */
  tradeLink(m: AccountMovement): string[] {
    return m.tradeEntryId ? ['/journal', m.tradeEntryId] : ['/journal'];
  }

  /**
   * « Locate » : a new locate, on any ticker (#625). A filter that would hide it switches to
   * « Locates », so what was just typed is on screen (#629).
   */
  openLocate(): void {
    this.dialog
      .open<NewLocateDialog, void, LocateInput | undefined>(NewLocateDialog, {
        width: '480px',
        maxWidth: '95vw',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .pipe(
        filter((input): input is LocateInput => !!input),
        switchMap((input) =>
          this.locates.create(input).pipe(
            tap((saved) => {
              this.toasts.success(
                this.translate.instant('locates.snackbar.createSuccess', { ticker: saved.ticker }),
              );
              const types = TYPES_BY_FILTER[this.appliedFilter().type];
              if (types && !types.includes('LOCATE')) {
                this.applyFilter({ ...this.appliedFilter(), type: 'locates' });
              }
              // Even when the filter switches : a type change only reloads the table, and the
              // locates tile moved too.
              this.fetch();
            }),
            catchError(() => {
              this.toasts.error(this.translate.instant('locates.snackbar.saveError'));
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }

  /**
   * A LOCATE line is never deleted as a movement : it deletes the locate itself, and the account
   * line goes with it.
   */
  deleteLocate(m: AccountMovement): void {
    const locateId = m.locateId;
    if (!locateId) return;
    this.confirm
      .ask('locates.confirmDelete', { params: { ticker: m.locateTicker }, variant: 'danger' })
      .pipe(
        filter(Boolean),
        switchMap(() => this.locates.delete(locateId)),
        tap(() => {
          this.toasts.success(this.translate.instant('locates.snackbar.deleteSuccess'));
          this.fetch();
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('locates.snackbar.deleteError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /** A correction settled by a morning reconciliation — the only rows that carry a measured gap. */
  isMorningCorrection(m: AccountMovement): boolean {
    return m.measuredGap !== null && m.measuredGap !== undefined;
  }

  /**
   * A morning's correction that has absorbed a later fix to an earlier row (#476) : its amount no
   * longer matches the gap its morning measured. Compared in cents — both come off the wire as
   * floats. An absent field must read as « no morning », or every row would be tagged.
   */
  isAdjusted(m: AccountMovement): boolean {
    const measured = m.measuredGap;
    if (measured === null || measured === undefined) return false;
    return Math.round(m.amount * 100) !== Math.round(measured * 100);
  }

  canEdit(m: AccountMovement): boolean {
    return m.type === 'DEPOSIT' || m.type === 'WITHDRAWAL';
  }

  canDelete(m: AccountMovement): boolean {
    return m.type !== 'TRADE' && m.type !== 'LOCATE';
  }

  delete(movement: AccountMovement): void {
    this.confirm
      .ask('account.confirmDelete', { variant: 'danger' })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.deleteMovement(movement.id)),
        tap(() => {
          this.toasts.success(this.translate.instant('account.snackbar.deleteSuccess'));
          this.fetch();
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('account.snackbar.deleteError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /** The morning may have moved the balance — refetch summary, series and movements. */
  onReconciled(): void {
    this.fetch();
  }

  /**
   * The banner's « Retry » — reruns the calls that failed, and only those. `reload()` is enough
   * here : a failed resource has no load in flight.
   */
  retry(): void {
    if (this.summaryFailed()) this.summaryResource.reload();
    if (this.seriesFailed()) this.seriesResource.reload();
    if (this.movementsFailed()) this.movementsResource.reload();
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  setPeriod(selection: PeriodSelection): void {
    this.applyFilter({ ...this.appliedFilter(), ...selection });
  }

  /** The type narrows the table only : the tiles and the curve keep the period's figures. */
  onTypeChange(type: MovementTypeFilter): void {
    this.appliedFilter.set({ ...this.appliedFilter(), type });
    this.pageIndex.set(0);
  }

  setCurrency(currency: BalanceCurrency): void {
    this.balanceCurrency.set(currency);
  }

  /**
   * Converts a USD hero amount for display : as-is in USD mode, or × the live rate in CAD mode. Used
   * for the hero balance and the curve only — the table stays in USD by design. A null rate (lookup
   * failed) can't be reached here : the CAD toggle is disabled until the rate loads.
   */
  convert(amountUsd: number): number {
    const r = this.rate();
    return this.currency() === 'CAD' && r ? amountUsd * r.rate : amountUsd;
  }

  /** Any filter change resets to the first page — page 4 of the old result set means nothing. */
  private applyFilter(next: AccountFilter): void {
    this.appliedFilter.set(next);
    this.pageIndex.set(0);
  }

  private clippedSeries(): BalancePoint[] {
    const { dateFrom, dateTo } = this.appliedFilter();
    return this.series().filter(
      (p) => (!dateFrom || p.date >= dateFrom) && (!dateTo || p.date <= dateTo),
    );
  }

  /** The toolbar state as the API reads it — presets resolved, the type choice expanded. */
  private toApiFilter(): AccountMovementFilter {
    const f = this.appliedFilter();
    return { dateFrom: f.dateFrom, dateTo: f.dateTo, types: TYPES_BY_FILTER[f.type] };
  }

  private openMovementDialog(movement: AccountMovement | null): void {
    const isUpdate = movement !== null;
    const data: MovementDialogData = { movement };
    const ref = this.dialog.open<
      MovementDialog,
      MovementDialogData,
      AccountMovementInput | undefined
    >(MovementDialog, { data, width: '480px', maxWidth: '95vw', autoFocus: 'first-tabbable' });
    ref
      .afterClosed()
      .pipe(
        filter((input): input is AccountMovementInput => !!input),
        switchMap((input) =>
          (isUpdate
            ? this.repo.updateMovement(movement.id, input)
            : this.repo.addMovement(input)
          ).pipe(
            tap(() => {
              this.toasts.success(
                this.translate.instant(
                  isUpdate ? 'account.snackbar.updateSuccess' : 'account.snackbar.createSuccess',
                ),
              );
              this.fetch();
            }),
            catchError(() => {
              this.toasts.error(
                this.translate.instant(
                  isUpdate ? 'account.snackbar.updateError' : 'account.snackbar.createError',
                ),
              );
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }

  /** After a write : the three calls again, superseding whatever is in flight. */
  private fetch(): void {
    this.writes.update((n) => n + 1);
  }
}
