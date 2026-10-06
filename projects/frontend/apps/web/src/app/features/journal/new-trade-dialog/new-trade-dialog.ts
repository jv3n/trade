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
  StbSelectModule,
} from '@portfolioai/ui';
import { isAfter, startOfDay } from 'date-fns';
import {
  NewTradeInput,
  TRADE_DIRECTIONS,
  TradeDirection,
} from '../../../core/api/journal/trade-entry.model';
import { PATTERNS, Pattern } from '../../../core/api/shared/pattern.model';

/**
 * A trade on its own (#634) — one the stats sheet never studied : an import, a session typed after
 * the fact. The day, the ticker, the pattern and the direction ; the fills are typed on its sheet.
 * The dialog is the confirmation : it closes with the [NewTradeInput] to save, the opener owns the
 * call.
 */
@Component({
  selector: 'app-new-trade-dialog',
  imports: [
    FormField,
    StbButtonModule,
    StbDatePickerModule,
    StbDialogModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbSelectModule,
    TranslatePipe,
  ],
  templateUrl: './new-trade-dialog.html',
  styleUrl: './new-trade-dialog.scss',
})
export class NewTradeDialog {
  private readonly dialogRef =
    inject<MatDialogRef<NewTradeDialog, NewTradeInput | undefined>>(MatDialogRef);

  readonly patterns = PATTERNS;
  readonly directions = TRADE_DIRECTIONS;
  readonly today = startOfDay(new Date());

  readonly tradeDate = signal(this.today);
  readonly text = signal({ ticker: '' });
  readonly textForm = form(this.text, (path) => {
    required(path.ticker);
    maxLength(path.ticker, 20);
  });
  readonly pattern = signal<Pattern>('GUS');
  readonly direction = signal<TradeDirection>('SHORT');

  readonly canSave = computed(
    () =>
      this.textForm().valid() &&
      this.text().ticker.trim() !== '' &&
      !isAfter(this.tradeDate(), this.today),
  );

  setDate(date: Date | null): void {
    if (date) this.tradeDate.set(startOfDay(date));
  }

  submit(): void {
    if (!this.canSave()) return;
    this.dialogRef.close({
      tradeDate: this.tradeDate(),
      ticker: this.text().ticker.trim().toUpperCase(),
      pattern: this.pattern(),
      direction: this.direction(),
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
