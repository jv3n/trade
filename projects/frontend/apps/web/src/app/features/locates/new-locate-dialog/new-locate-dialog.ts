import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { TranslatePipe } from '@ngx-translate/core';
import {
  MatDialogRef,
  StbButtonModule,
  StbDatePickerModule,
  StbDialogModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
} from '@portfolioai/ui';
import { startOfDay } from 'date-fns';
import { Subscription } from 'rxjs';
import { CandidatesRepository } from '../../../core/api/candidates/candidates.repository';
import { LocateInput } from '../../../core/api/locates/locates.model';
import { locateBreach, locateCost, locatePercent } from '../../../shared/locate-cost/locate-cost';
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';

/**
 * A new locate (#625) — from Today and from the Account page : the day, the ticker, the shares and
 * the price per share, the cost and the locate's weight against the share's price previewing live
 * (the 2 % rule). The share's price starts from the PM open of that day's candidate on the ticker —
 * matched by (day, ticker), never a link — until one is typed. A locate is a cost on a (day, ticker), linked to
 * nothing. Closes with the [LocateInput] to save, the opener owns the call.
 */
@Component({
  selector: 'app-new-locate-dialog',
  imports: [
    DecimalPipe,
    FormField,
    NumberMaskDirective,
    StbButtonModule,
    StbDatePickerModule,
    StbDialogModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    TranslatePipe,
  ],
  templateUrl: './new-locate-dialog.html',
  styleUrl: './new-locate-dialog.scss',
})
export class NewLocateDialog {
  private readonly dialogRef =
    inject<MatDialogRef<NewLocateDialog, LocateInput | undefined>>(MatDialogRef);
  private readonly candidates = inject(CandidatesRepository);

  readonly tradingDate = signal(startOfDay(new Date()));
  /** Typed through Signal Forms ; the numbers and the date are pushed by hand (CVA clash). */
  readonly text = signal({ ticker: '', note: '' });
  readonly textForm = form(this.text, (path) => {
    required(path.ticker);
    maxLength(path.ticker, 20);
    maxLength(path.note, 2000);
  });
  readonly shares = signal<number | null>(null);
  readonly price = signal<number | null>(null);
  /** The PM opens of the day's candidates, by ticker. */
  private readonly pmOpens = signal<ReadonlyMap<string, number>>(new Map());
  private pmOpensCall?: Subscription;
  /** `undefined` until typed : the day's PM open on the ticker fills it meanwhile. */
  private readonly typedStockPrice = signal<number | null | undefined>(undefined);
  /** The share's price when the locate is bought — what the locate is weighed against. */
  readonly stockPrice = computed(() => {
    const typed = this.typedStockPrice();
    if (typed !== undefined) return typed;
    return this.pmOpens().get(this.text().ticker.trim().toUpperCase()) ?? null;
  });
  readonly percent = computed(() => locatePercent(this.price(), this.stockPrice()));
  readonly breach = computed(() => locateBreach(this.percent()));

  readonly cost = computed(() => locateCost(this.shares(), this.price()));
  readonly canSave = computed(
    () => this.textForm().valid() && this.text().ticker.trim() !== '' && this.cost() !== null,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pmOpensCall?.unsubscribe());
    this.loadPmOpens();
  }

  setDate(date: Date | null): void {
    if (!date) return;
    this.tradingDate.set(startOfDay(date));
    this.loadPmOpens();
  }

  setStockPrice(stockPrice: number | null): void {
    this.typedStockPrice.set(stockPrice);
  }

  submit(): void {
    const shares = this.shares();
    const price = this.price();
    if (!this.canSave() || shares === null || price === null) return;
    this.dialogRef.close({
      tradingDate: this.tradingDate(),
      ticker: this.text().ticker.trim().toUpperCase(),
      shares,
      pricePerShare: price,
      stockPrice: this.stockPrice(),
      note: this.text().note.trim() || null,
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  /** No candidate that day, or no answer : the share's price is typed by hand. */
  private loadPmOpens(): void {
    this.pmOpensCall?.unsubscribe();
    this.pmOpensCall = this.candidates.listForDate(this.tradingDate()).subscribe({
      next: (list) => this.pmOpens.set(new Map(list.map((c) => [c.ticker, c.pmOpen]))),
      error: () => this.pmOpens.set(new Map()),
    });
  }
}
