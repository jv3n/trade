import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  StbButtonModule,
  StbChipsModule,
  StbDialogModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbToast,
  StbTooltipModule,
} from '@portfolioai/ui';
import { EMPTY, catchError, filter, finalize, switchMap, tap } from 'rxjs';
import { Locate } from '../../../core/api/locates/locates.model';
import { LocatesRepository } from '../../../core/api/locates/locates.repository';
import { ConfirmService } from '../../../core/app-state/confirm.service';
import {
  blendedLocatePercent,
  locateBreach,
  locateCost,
  locatePercent,
  sumCents,
} from '../../../shared/locate-cost/locate-cost';
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';
import { PricePipe } from '../../../shared/price/price.pipe';

/** The (day, ticker) the dialog is opened on. */
export interface LocatesDialogData {
  tradingDate: Date;
  ticker: string;
  /** The last price paid on that ticker that day — where a top-up's price starts. */
  lastPrice: number | null;
  /**
   * The share's price to start from when no locate of the day has one — the PM open of that day's
   * candidate on the ticker, or of its stat. Matched by (day, ticker), never a link.
   */
  stockPrice: number | null;
}

/**
 * The **locates of a (day, ticker)** (#625) — opened from the trade sheet and from a ticker of
 * Today's locates : each one corrected in place (shares, price — an edit, no confirmation) or
 * deleted through the confirmation modal, their total, and the form that adds one.
 * A top-up starts from the last price paid and is corrected when it went at another price ; the cost
 * previews live.
 *
 * Closes with `true` when anything changed, so the opener reloads its totals.
 */
@Component({
  selector: 'app-locates-dialog',
  imports: [
    DecimalPipe,
    NumberMaskDirective,
    PricePipe,
    StbButtonModule,
    StbChipsModule,
    StbDialogModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './locates-dialog.html',
  styleUrl: './locates-dialog.scss',
})
export class LocatesDialog {
  private readonly dialogRef = inject<MatDialogRef<LocatesDialog, boolean>>(MatDialogRef);
  readonly data = inject<LocatesDialogData>(MAT_DIALOG_DATA);
  private readonly repo = inject(LocatesRepository);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(StbToast);
  private readonly translate = inject(TranslateService);

  readonly locates = signal<Locate[]>([]);
  readonly loadError = signal(false);
  readonly saving = signal(false);
  private changed = false;

  /** What the rows add up to — the shares to weigh against the position, and the cost. */
  readonly totalShares = computed(() => this.locates().reduce((sum, l) => sum + l.shares, 0));
  readonly totalCost = computed(() => sumCents(this.locates().map((l) => l.cost)));
  /** The day's weight on the ticker, across top-ups at different prices. */
  readonly totalPercent = computed(() => blendedLocatePercent(this.locates()));
  readonly breach = locateBreach;

  readonly shares = signal<number | null>(null);
  readonly price = signal<number | null>(this.data.lastPrice);
  /**
   * The share's price when the locate is bought — starts from the last locate's (a top-up is the same
   * share), else from the day's PM open ; corrected when typed.
   */
  readonly stockPrice = signal<number | null>(this.data.stockPrice);
  private stockPriceTyped = false;
  readonly cost = computed(() => locateCost(this.shares(), this.price()));
  readonly percent = computed(() => locatePercent(this.price(), this.stockPrice()));
  readonly canAdd = computed(() => this.cost() !== null && !this.saving());

  /** The row being corrected, with what is typed — an edit, so no confirmation. */
  readonly editing = signal<{
    id: string;
    shares: number | null;
    price: number | null;
    stockPrice: number | null;
  } | null>(null);
  readonly editCost = computed(() => {
    const e = this.editing();
    return e ? locateCost(e.shares, e.price) : null;
  });

  constructor() {
    this.load();
  }

  add(): void {
    const shares = this.shares();
    const price = this.price();
    if (!this.canAdd() || shares === null || price === null) return;
    this.saving.set(true);
    this.repo
      .create({
        tradingDate: this.data.tradingDate,
        ticker: this.data.ticker,
        shares,
        pricePerShare: price,
        stockPrice: this.stockPrice(),
        note: null,
      })
      .pipe(
        tap(() => {
          this.changed = true;
          this.toasts.success(
            this.translate.instant('locates.snackbar.createSuccess', {
              ticker: this.data.ticker,
            }),
          );
          this.shares.set(null);
          this.load();
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('locates.snackbar.saveError'));
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe();
  }

  startEdit(locate: Locate): void {
    this.editing.set({
      id: locate.id,
      shares: locate.shares,
      price: locate.pricePerShare,
      stockPrice: locate.stockPrice,
    });
  }

  setEditShares(shares: number | null): void {
    this.editing.update((e) => (e ? { ...e, shares } : e));
  }

  setEditPrice(price: number | null): void {
    this.editing.update((e) => (e ? { ...e, price } : e));
  }

  setStockPrice(stockPrice: number | null): void {
    this.stockPriceTyped = true;
    this.stockPrice.set(stockPrice);
  }

  setEditStockPrice(stockPrice: number | null): void {
    this.editing.update((e) => (e ? { ...e, stockPrice } : e));
  }

  /** A row's weight against the share's price — `null` when it was typed without one. */
  percentOf(locate: Locate): number | null {
    return locatePercent(locate.pricePerShare, locate.stockPrice);
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  saveEdit(locate: Locate): void {
    const e = this.editing();
    if (!e || e.shares === null || e.price === null || this.editCost() === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.repo
      .update(locate.id, {
        shares: e.shares,
        pricePerShare: e.price,
        stockPrice: e.stockPrice,
        note: locate.note,
      })
      .pipe(
        tap(() => {
          this.changed = true;
          this.editing.set(null);
          this.toasts.success(this.translate.instant('locates.snackbar.updateSuccess'));
          this.load();
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('locates.snackbar.saveError'));
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe();
  }

  delete(locate: Locate): void {
    if (this.saving()) return;
    this.confirm
      .ask('locates.confirmDelete', {
        params: { ticker: this.data.ticker },
        variant: 'danger',
      })
      .pipe(
        filter(Boolean),
        tap(() => this.saving.set(true)),
        switchMap(() => this.repo.delete(locate.id).pipe(finalize(() => this.saving.set(false)))),
        tap(() => {
          this.changed = true;
          this.toasts.success(this.translate.instant('locates.snackbar.deleteSuccess'));
          this.load();
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('locates.snackbar.deleteError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  close(): void {
    this.dialogRef.close(this.changed);
  }

  private load(): void {
    this.repo.listForDate(this.data.tradingDate, this.data.ticker).subscribe({
      next: (list) => {
        this.locates.set(list);
        this.loadError.set(false);
        if (!this.stockPriceTyped) {
          this.stockPrice.set(list.at(-1)?.stockPrice ?? this.data.stockPrice);
        }
      },
      error: () => this.loadError.set(true),
    });
  }
}
