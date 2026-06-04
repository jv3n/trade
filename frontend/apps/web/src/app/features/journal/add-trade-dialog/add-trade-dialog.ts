import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { TranslatePipe } from '@ngx-translate/core';
import { StbDatePickerModule } from '@portfolioai/ui';

import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';

import {
  TRADE_EXIT_STRATEGIES,
  TRADE_OPEN_SIDES,
  TRADE_PATTERNS,
  TRADE_PLAYS,
  TradeEntry,
  TradeEntryInput,
  TradeExitStrategy,
  TradeOpenSide,
  TradePattern,
  TradePlay,
} from '../../../core/api/journal/trade-entry.model';

/** Data passed to the dialog — `entry` non-null = edit mode, null = create mode. */
export interface AddTradeDialogData {
  entry: TradeEntry | null;
}

/**
 * Form model — the Signal Forms tree's source of truth. Strings are non-nullable (empty `""`
 * by default) so the `[formField]` directive on `<input>` / `<textarea>` has a consistent
 * type ; the form output [TradeEntryInput] sends `null` for blank strings.
 */
interface TradeFormModel {
  tradeDate: Date;
  ticker: string;
  play: TradePlay;
  pattern: TradePattern;
  size: number | null;
  openPrice: number | null;
  exitPrice: number | null;
  profitDollars: number | null;
  gainPercent: number | null;
  note: string;
  pre935To10h: boolean;
  preGapUp50: boolean;
  prePrice1To10: boolean;
  preFloat3To50m: boolean;
  preWaitPush: boolean;
  openSide: TradeOpenSide | null;
  shortOnResistance: boolean;
  exitStrategy: TradeExitStrategy | null;
  errorNote: string;
}

/**
 * Dialog form for creating / editing a trade entry — built on **Signal Forms**
 * (Angular 22's signal-native forms API at `@angular/forms/signals`). The model lives in a
 * `WritableSignal<TradeFormModel>` ; the `form()` call wraps it into a `FieldTree` that
 * inputs bind to via the `[formField]` directive — no `formControlName`, no `[formGroup]`,
 * no HTML validation attrs (Signal Forms forbids them on `[formField]` elements ; the schema
 * is the single source of truth).
 *
 * Three sections : execution (required fields), exit (nullable until close), preparation
 * checklist (all nullable). Returns the **domain** [TradeEntryInput] on close — the
 * HTTP adapter handles the wire serialisation (Date → `YYYY-MM-DD`, empty string → null).
 */
@Component({
  selector: 'app-add-trade-dialog',
  standalone: true,
  imports: [
    FormField,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    NumberMaskDirective,
    StbDatePickerModule,
    TranslatePipe,
  ],
  templateUrl: './add-trade-dialog.html',
  styleUrl: './add-trade-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddTradeDialog {
  private readonly dialogRef = inject<MatDialogRef<AddTradeDialog, TradeEntryInput | undefined>>(
    MatDialogRef,
  );
  private readonly data = inject<AddTradeDialogData>(MAT_DIALOG_DATA);

  readonly isEdit = computed(() => this.data.entry !== null);
  readonly submitting = signal(false);

  readonly plays = TRADE_PLAYS;
  readonly patterns = TRADE_PATTERNS;
  readonly openSides = TRADE_OPEN_SIDES;
  readonly exitStrategies = TRADE_EXIT_STRATEGIES;

  readonly model = signal<TradeFormModel>(this.initialModel());

  // Signal Forms tree. Validators are declared via a schema callback that receives the path
  // for each field — typed and refactor-safe.
  readonly tradeForm = form(this.model, (path) => {
    required(path.ticker);
    maxLength(path.ticker, 20);
    required(path.play);
    required(path.pattern);
    required(path.size);
    min(path.size, 1);
    required(path.openPrice);
    min(path.openPrice, 0.0001);
  });

  submit(): void {
    if (!this.tradeForm().valid()) {
      this.tradeForm().markAsTouched();
      return;
    }
    const v = this.model();
    const input: TradeEntryInput = {
      tradeDate: v.tradeDate,
      ticker: v.ticker,
      play: v.play,
      pattern: v.pattern,
      size: v.size!,
      openPrice: v.openPrice!,
      exitPrice: v.exitPrice,
      profitDollars: v.profitDollars,
      gainPercent: v.gainPercent,
      note: v.note || null,
      pre935To10h: v.pre935To10h,
      preGapUp50: v.preGapUp50,
      prePrice1To10: v.prePrice1To10,
      preFloat3To50m: v.preFloat3To50m,
      preWaitPush: v.preWaitPush,
      openSide: v.openSide,
      shortOnResistance: v.shortOnResistance,
      exitStrategy: v.exitStrategy,
      errorNote: v.errorNote || null,
    };
    this.dialogRef.close(input);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  // ---- Imperative setters — wired to `(dateChange)` / `(numberChange)` because Signal
  //      Forms' `[formField]` clashes with Material's CVA-based `MatDatepickerInput` and with
  //      our `appNumberMask` directive. We push values through `model.update(...)` so Signal
  //      Forms still picks up the change for validation. ----------------------------------

  setTradeDate(d: Date | null): void {
    // Material's datepicker emits `null` when the field is cleared — coerce to "today"
    // since a trade journal entry without a date is meaningless.
    this.model.update((m) => ({ ...m, tradeDate: d ?? new Date() }));
  }

  setSize(n: number | null): void {
    this.model.update((m) => ({ ...m, size: n }));
  }

  setOpenPrice(n: number | null): void {
    this.model.update((m) => ({ ...m, openPrice: n }));
  }

  setExitPrice(n: number | null): void {
    this.model.update((m) => ({ ...m, exitPrice: n }));
  }

  setProfitDollars(n: number | null): void {
    this.model.update((m) => ({ ...m, profitDollars: n }));
  }

  setGainPercent(n: number | null): void {
    this.model.update((m) => ({ ...m, gainPercent: n }));
  }

  private initialModel(): TradeFormModel {
    const entry = this.data.entry;
    if (!entry) {
      return {
        tradeDate: new Date(),
        ticker: '',
        play: 'A',
        pattern: 'GUS',
        size: null,
        openPrice: null,
        exitPrice: null,
        profitDollars: null,
        gainPercent: null,
        note: '',
        pre935To10h: false,
        preGapUp50: false,
        prePrice1To10: false,
        preFloat3To50m: false,
        preWaitPush: false,
        openSide: null,
        shortOnResistance: false,
        exitStrategy: null,
        errorNote: '',
      };
    }
    return {
      tradeDate: entry.tradeDate,
      ticker: entry.ticker,
      play: entry.play,
      pattern: entry.pattern,
      size: entry.size,
      openPrice: entry.openPrice,
      exitPrice: entry.exitPrice,
      profitDollars: entry.profitDollars,
      gainPercent: entry.gainPercent,
      note: entry.note ?? '',
      pre935To10h: entry.pre935To10h ?? false,
      preGapUp50: entry.preGapUp50 ?? false,
      prePrice1To10: entry.prePrice1To10 ?? false,
      preFloat3To50m: entry.preFloat3To50m ?? false,
      preWaitPush: entry.preWaitPush ?? false,
      openSide: entry.openSide,
      shortOnResistance: entry.shortOnResistance ?? false,
      exitStrategy: entry.exitStrategy,
      errorNote: entry.errorNote ?? '',
    };
  }
}
