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
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';
import { PricePipe } from '../../../shared/price/price.pipe';
import { locateCost } from '../candidates.math';

/** The row the dialog was opened from. */
export interface LocatesDialogData {
  candidateId: string;
  ticker: string;
  tradingDate: Date;
  /** The candidate's locate quote — where the price of a new locate starts. */
  locatePerShare: number | null;
}

/**
 * The **Locates** of a candidate row (#607, after `mockup/candidat.html`) : the day's locates on its
 * ticker — the ones typed on the Account page included — each deletable through the confirmation
 * modal, and the form that adds one. The price starts from the candidate's quote and is corrected
 * when a top-up went at another price ; the cost previews live.
 *
 * Closes with `true` when anything changed, so the page reloads its totals.
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

  readonly shares = signal<number | null>(null);
  readonly price = signal<number | null>(this.data.locatePerShare);
  readonly cost = computed(() => locateCost(this.shares(), this.price()));
  readonly canAdd = computed(() => this.cost() !== null && !this.saving());

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
        shares,
        pricePerShare: price,
        candidateId: this.data.candidateId,
        tradingDate: null,
        ticker: null,
        note: null,
      })
      .pipe(
        tap(() => {
          this.changed = true;
          this.toasts.success(
            this.translate.instant('candidates.locates.snackbar.createSuccess', {
              ticker: this.data.ticker,
            }),
          );
          this.shares.set(null);
          this.load();
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('candidates.locates.snackbar.saveError'));
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe();
  }

  delete(locate: Locate): void {
    this.confirm
      .ask('candidates.locates.confirmDelete', {
        params: { ticker: this.data.ticker },
        variant: 'danger',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.delete(locate.id)),
        tap(() => {
          this.changed = true;
          this.toasts.success(this.translate.instant('candidates.locates.snackbar.deleteSuccess'));
          this.load();
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('candidates.locates.snackbar.deleteError'));
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
      },
      error: () => this.loadError.set(true),
    });
  }
}
