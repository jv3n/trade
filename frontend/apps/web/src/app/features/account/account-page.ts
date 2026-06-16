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
  StbDividerModule,
  StbIconModule,
  StbPaginatorModule,
  StbProgressSpinnerModule,
  StbTooltipModule,
} from '@portfolioai/ui';
import { format } from 'date-fns';
import { EMPTY, catchError, filter, switchMap, tap } from 'rxjs';
import {
  AccountMovement,
  AccountMovementInput,
  AccountSummary,
  BalancePoint,
  CorrectionInput,
} from '../../core/api/account/account.model';
import { AccountRepository } from '../../core/api/account/account.repository';
import { ForexRate } from '../../core/api/forex/forex.model';
import { ForexRepository } from '../../core/api/forex/forex.repository';
import { CorrectionDialog } from './correction-dialog/correction-dialog';
import { MovementDialog, MovementDialogData } from './movement-dialog/movement-dialog';

/** A day's worth of movements with its running subtotal — built from the current page's content. */
interface DayGroup {
  key: string;
  date: Date;
  subtotal: number;
  rows: AccountMovement[];
}

/** Window presets for the balance chart + the hero change KPI. */
type Period = '1W' | '1M' | '3M' | 'YTD' | 'ALL';
const PERIODS: readonly Period[] = ['1W', '1M', '3M', 'YTD', 'ALL'];

/**
 * Display currency for the hero balance. The account is USD-denominated ; CAD is a cosmetic
 * conversion of the **hero balance only** (movements, summary and chart stay in USD) using the live
 * ECB reference rate. The toggle resets to USD on each visit — it's a presentation preference, not
 * stored state.
 */
type Currency = 'USD' | 'CAD';
const CURRENCIES: readonly Currency[] = ['USD', 'CAD'];

/**
 * Broker cash-account page. Hero balance + summary panel (from `/summary`) and the movement history
 * grouped by date with a daily subtotal (from `/movements`, paginated). Manual movements get
 * edit / delete ; TRADE movements are read-only and link back to the journal (ticker rendered via
 * the `stbChip="ticker"` directive, per the project convention).
 *
 * Every mutation refetches summary + movements — the dataset is small, so we trust the server
 * rather than splicing locally. The balance-evolution chart ships in a follow-up slice.
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
    StbDividerModule,
    StbIconModule,
    StbPaginatorModule,
    StbProgressSpinnerModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './account-page.html',
  styleUrl: './account-page.scss',
})
export class AccountPage {
  private readonly repo = inject(AccountRepository);
  private readonly forex = inject(ForexRepository);
  private readonly dialog = inject(MatDialog);
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
  readonly periods = PERIODS;
  readonly period = signal<Period>('1M');

  /** USD→other-currency rate for the hero toggle ; null until loaded (or if the lookup failed). */
  readonly rate = signal<ForexRate | null>(null);
  readonly currencies = CURRENCIES;
  readonly currency = signal<Currency>('USD');

  /** Series filtered to the selected window, mapped for the chart (x = epoch ms, label = date). */
  readonly chartPoints = computed<AreaChartPoint[]>(() => {
    const start = this.windowStart(this.period());
    const pts = start ? this.series().filter((p) => p.date >= start) : this.series();
    return pts.map((p) => ({
      x: p.date.getTime(),
      y: p.balance,
      label: format(p.date, 'd MMM yyyy'),
    }));
  });

  /**
   * Change over the selected window : current balance vs the balance just before the window opened
   * (0 if the account started inside it, or for the ALL preset). `percent` is null when the base is
   * 0 (no meaningful ratio).
   */
  readonly periodChange = computed<{ amount: number; percent: number | null } | null>(() => {
    const pts = this.series();
    if (pts.length === 0) return null;
    const current = pts[pts.length - 1].balance;
    const start = this.windowStart(this.period());
    const before = start ? pts.filter((p) => p.date < start) : [];
    const base = before.length ? before[before.length - 1].balance : 0;
    const amount = current - base;
    return { amount, percent: base !== 0 ? (amount / Math.abs(base)) * 100 : null };
  });

  /**
   * Groups the current page's movements by value date, preserving the server order (value_date
   * desc, created_at desc) — so same-date rows are contiguous and a group's subtotal is its sum.
   */
  readonly groups = computed<DayGroup[]>(() => {
    const out: DayGroup[] = [];
    for (const m of this.movements()) {
      const key = format(m.valueDate, 'yyyy-MM-dd');
      const last = out.length ? out[out.length - 1] : null;
      const group = last && last.key === key ? last : null;
      if (group) {
        group.rows.push(m);
        group.subtotal += m.amount;
      } else {
        out.push({ key, date: m.valueDate, subtotal: m.amount, rows: [m] });
      }
    }
    return out;
  });

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

  canEdit(m: AccountMovement): boolean {
    return m.type === 'DEPOSIT' || m.type === 'WITHDRAWAL';
  }

  canDelete(m: AccountMovement): boolean {
    return m.type !== 'TRADE';
  }

  delete(movement: AccountMovement): void {
    if (!confirm(this.translate.instant('account.confirmDelete'))) return;
    this.repo
      .deleteMovement(movement.id)
      .pipe(
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

  openCorrect(): void {
    const ref = this.dialog.open<CorrectionDialog, void, CorrectionInput | undefined>(
      CorrectionDialog,
      { width: '480px', maxWidth: '95vw', autoFocus: 'first-tabbable' },
    );
    ref
      .afterClosed()
      .pipe(
        filter((input): input is CorrectionInput => !!input),
        switchMap((input) =>
          this.repo.correctBalance(input).pipe(
            tap(() => {
              this.toast('account.snackbar.correctSuccess', 'success');
              this.fetch();
            }),
            catchError(() => {
              this.toast('account.snackbar.correctError', 'error');
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.fetchMovements();
  }

  setPeriod(period: Period): void {
    this.period.set(period);
  }

  setCurrency(currency: Currency): void {
    this.currency.set(currency);
  }

  /**
   * Converts a USD hero amount for display : as-is in USD mode, or × the live rate in CAD mode. Used
   * for the hero balance and its change KPI only — the rest of the page stays in USD by design. A
   * null rate (lookup failed) can't be reached here : the CAD toggle is disabled until the rate loads.
   */
  convert(amountUsd: number): number {
    const r = this.rate();
    return this.currency() === 'CAD' && r ? amountUsd * r.rate : amountUsd;
  }

  /** Start of the selected window from "now" ; null = no lower bound (the ALL preset). */
  private windowStart(period: Period): Date | null {
    const now = new Date();
    switch (period) {
      case '1W': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return d;
      }
      case '1M': {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        return d;
      }
      case '3M': {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 3);
        return d;
      }
      case 'YTD':
        return new Date(now.getFullYear(), 0, 1);
      case 'ALL':
        return null;
    }
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
    this.repo.getSummary().subscribe({
      next: (s) => this.summary.set(s),
      error: () => this.error.set(this.translate.instant('account.errors.load')),
    });
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
    this.repo.findMovements({ pageIndex: this.pageIndex(), pageSize: this.pageSize() }).subscribe({
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
