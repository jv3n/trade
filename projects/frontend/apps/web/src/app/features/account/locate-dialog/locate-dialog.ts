import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
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
import { LocateInput } from '../../../core/api/locates/locates.model';
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';
import { locateCost } from '../../candidates/candidates.math';

/**
 * « Locate » on the Account page (#608, after `mockup/compte.html`) : a locate on a ticker off the
 * candidates — the day, the ticker, the shares and the price per share, the cost previewing live.
 * Those of a candidate are typed on its row. Closes with the [LocateInput] to save, the page owns
 * the call.
 */
@Component({
  selector: 'app-locate-dialog',
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
  templateUrl: './locate-dialog.html',
  styleUrl: './locate-dialog.scss',
})
export class LocateDialog {
  private readonly dialogRef =
    inject<MatDialogRef<LocateDialog, LocateInput | undefined>>(MatDialogRef);

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

  readonly cost = computed(() => locateCost(this.shares(), this.price()));
  readonly canSave = computed(
    () => this.textForm().valid() && this.text().ticker.trim() !== '' && this.cost() !== null,
  );

  setDate(date: Date | null): void {
    if (date) this.tradingDate.set(startOfDay(date));
  }

  submit(): void {
    const shares = this.shares();
    if (!this.canSave() || shares === null) return;
    this.dialogRef.close({
      shares,
      pricePerShare: this.price(),
      candidateId: null,
      tradingDate: this.tradingDate(),
      ticker: this.text().ticker.trim().toUpperCase(),
      note: this.text().note.trim() || null,
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
