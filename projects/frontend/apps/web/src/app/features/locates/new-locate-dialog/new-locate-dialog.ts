import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
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
  /** The day's candidates — a day picked again drops the answer of the one left. */
  private readonly dayCandidates = rxResource({
    params: () => this.tradingDate(),
    stream: ({ params }) => this.candidates.listForDate(params),
  });
  /**
   * The PM opens of the day's candidates, by ticker. No candidate that day, or no answer : the
   * share's price is typed by hand.
   */
  private readonly pmOpens = computed<ReadonlyMap<string, number>>(
    () =>
      new Map(
        this.dayCandidates.hasValue()
          ? this.dayCandidates.value().map((c) => [c.ticker, c.pmOpen])
          : [],
      ),
  );
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

  setDate(date: Date | null): void {
    if (!date) return;
    this.tradingDate.set(startOfDay(date));
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
}
