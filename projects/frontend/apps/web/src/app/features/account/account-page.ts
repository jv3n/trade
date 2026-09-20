import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AreaChartPoint,
  StbAreaChart,
  StbButtonModule,
  StbButtonToggleModule,
  StbCardModule,
  StbChipsModule,
  StbDatePickerModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbPaginatorModule,
  StbProgressSpinnerModule,
  StbSelectModule,
  StbTableModule,
  StbTooltipModule,
} from '@portfolioai/ui';
import { format } from 'date-fns';
import { EMPTY, catchError, filter, switchMap, tap } from 'rxjs';
import {
  AccountMovement,
  AccountMovementFilter,
  AccountMovementInput,
  AccountMovementType,
  AccountSummary,
  BalancePoint,
} from '../../core/api/account/account.model';
import { AccountRepository } from '../../core/api/account/account.repository';
import { ForexRate } from '../../core/api/forex/forex.model';
import { ForexRepository } from '../../core/api/forex/forex.repository';
import {
  BalanceCurrency,
  BalanceCurrencyService,
} from '../../core/app-state/balance-currency.service';
import { ConfirmService } from '../../core/app-state/confirm.service';
import {
  PERIOD_PRESETS,
  PeriodPresetKey,
  computePeriodRange,
} from '../../shared/period-preset/period-preset';
import { MorningReconciliation } from './morning-reconciliation/morning-reconciliation';
import { MovementDialog, MovementDialogData } from './movement-dialog/movement-dialog';

/**
 * The type filter as the user reads it. `cash` groups deposits and withdrawals : from the ledger's
 * point of view they are the same question — money I put in or took out — and the mockup offers
 * them as one choice.
 */
export type MovementTypeFilter = 'all' | 'trades' | 'cash' | 'corrections';

export const MOVEMENT_TYPE_FILTERS: readonly MovementTypeFilter[] = [
  'all',
  'trades',
  'cash',
  'corrections',
];

const TYPES_BY_FILTER: Record<MovementTypeFilter, readonly AccountMovementType[] | null> = {
  all: null,
  trades: ['TRADE'],
  cash: ['DEPOSIT', 'WITHDRAWAL'],
  corrections: ['ADJUSTMENT'],
};

/** What the filter toolbar holds. The preset is UI-only — only the resolved dates reach the API. */
interface AccountFilter {
  period: PeriodPresetKey;
  dateFrom: Date | null;
  dateTo: Date | null;
  type: MovementTypeFilter;
}

/**
 * Broker cash-account page, laid out after `mockup/compte.html` (#229) : a KPI row (balance with
 * its USD / CAD switch, P&L of the period, net injected), the balance curve in its own card, and
 * the movements as a filterable table carrying the running balance.
 *
 * **One filter drives everything.** The period + type toolbar feeds `/summary`, `/movements` and
 * the chart window at once, so the three always describe the same slice — a KPI row that disagreed
 * with the table below it would be worse than no KPI at all. The filter mirrors the journal's,
 * presets included, and only resolved dates travel to the backend.
 *
 * The balance column comes from the server (`balanceAfter`), never recomputed here : it is defined
 * over the whole history, so filtering to trades must not renumber it.
 *
 * Every mutation refetches summary + movements — the dataset is small, so we trust the server
 * rather than splicing locally.
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
    StbDatePickerModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbPaginatorModule,
    StbProgressSpinnerModule,
    StbSelectModule,
    StbTableModule,
    StbTooltipModule,
    MorningReconciliation,
    TranslatePipe,
  ],
  templateUrl: './account-page.html',
  styleUrl: './account-page.scss',
})
export class AccountPage {
  private readonly repo = inject(AccountRepository);
  private readonly forex = inject(ForexRepository);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly summary = signal<AccountSummary | null>(null);
  readonly movements = signal<AccountMovement[]>([]);
  readonly totalElements = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(25);

  readonly series = signal<BalancePoint[]>([]);

  /** Today, captured once so the header date doesn't re-evaluate on every change detection. */
  readonly today = new Date();

  readonly periods = PERIOD_PRESETS;
  readonly typeFilters = MOVEMENT_TYPE_FILTERS;

  /** Defaults to the running month — the question the page is opened to answer. */
  readonly appliedFilter = signal<AccountFilter>({
    period: 'thisMonth',
    ...computePeriodRange('thisMonth'),
    type: 'all',
  });

  readonly displayedColumns = ['valueDate', 'type', 'label', 'amount', 'balanceAfter', 'actions'];

  /** USD→other-currency rate for the hero toggle ; null until loaded (or if the lookup failed). */
  readonly rate = signal<ForexRate | null>(null);

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

  /** Tells the two dollars apart in the tooltip — both currencies use the same sign. */
  readonly currencySuffix = computed(() => (this.currency() === 'CAD' ? ' $ CA' : ' $ US'));

  constructor() {
    this.fetch();
    this.fetchRate();
  }

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

  canEdit(m: AccountMovement): boolean {
    return m.type === 'DEPOSIT' || m.type === 'WITHDRAWAL';
  }

  canDelete(m: AccountMovement): boolean {
    return m.type !== 'TRADE';
  }

  delete(movement: AccountMovement): void {
    this.confirm
      .ask('account.confirmDelete', { variant: 'danger' })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.deleteMovement(movement.id)),
        tap(() => {
          this.toast('account.snackbar.deleteSuccess', 'success');
          this.fetch();
        }),
        catchError(() => {
          this.toast('account.snackbar.deleteError', 'error');
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /** The morning may have moved the balance — refetch summary, series and movements. */
  onReconciled(): void {
    this.fetch();
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.fetchMovements();
  }

  /** A preset fills the range ; `custom` leaves the two pickers to the user. */
  onPeriodChange(period: PeriodPresetKey): void {
    const range = computePeriodRange(period);
    this.applyFilter(
      period === 'custom'
        ? { ...this.appliedFilter(), period }
        : { ...this.appliedFilter(), period, ...range },
    );
  }

  setDateFrom(dateFrom: Date | null): void {
    this.applyFilter({ ...this.appliedFilter(), dateFrom });
  }

  setDateTo(dateTo: Date | null): void {
    this.applyFilter({ ...this.appliedFilter(), dateTo });
  }

  onTypeChange(type: MovementTypeFilter): void {
    this.applyFilter({ ...this.appliedFilter(), type });
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
    this.fetch();
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
              this.toast(
                isUpdate ? 'account.snackbar.updateSuccess' : 'account.snackbar.createSuccess',
                'success',
              );
              this.fetch();
            }),
            catchError(() => {
              this.toast(
                isUpdate ? 'account.snackbar.updateError' : 'account.snackbar.createError',
                'error',
              );
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }

  private fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this.repo.getSummary(this.toApiFilter()).subscribe({
      next: (s) => this.summary.set(s),
      error: () => this.error.set(this.translate.instant('account.errors.load')),
    });
    // The whole series, always : the chart is clipped client-side, so changing the window doesn't
    // cost a round-trip and the curve keeps its shape when the user flips between presets.
    this.repo.getBalanceSeries().subscribe({
      next: (pts) => this.series.set(pts),
      error: () => this.error.set(this.translate.instant('account.errors.load')),
    });
    this.fetchMovements();
  }

  /**
   * One-shot USD→CAD rate fetch (the figure is cached ~6 h backend-side, so we don't refetch on each
   * mutation like summary/movements). A failure is non-blocking : `rate` stays null, the CAD toggle
   * stays disabled and the balance keeps showing USD — no error banner for a cosmetic feature.
   */
  private fetchRate(): void {
    this.forex.latestRate().subscribe({
      next: (r) => this.rate.set(r),
      error: () => this.rate.set(null),
    });
  }

  private fetchMovements(): void {
    this.loading.set(true);
    this.repo
      .findMovements(this.toApiFilter(), {
        pageIndex: this.pageIndex(),
        pageSize: this.pageSize(),
      })
      .subscribe({
        next: (page) => {
          this.movements.set(page.content);
          this.totalElements.set(page.totalElements);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(this.translate.instant('account.errors.load'));
          this.loading.set(false);
        },
      });
  }

  private toast(key: string, variant: 'success' | 'error'): void {
    this.snackBar.open(this.translate.instant(key), undefined, {
      duration: variant === 'success' ? 3000 : 5000,
      panelClass: `stb-snack-bar--${variant}`,
    });
  }
}
