import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbCheckboxModule,
  StbDatePickerModule,
  StbDialogModule,
  StbDividerModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbProgressSpinnerModule,
} from '@portfolioai/ui';
import { StatEntry, StatEntryInput } from '../../../core/api/stats/stat-entry.model';
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';

/** Data passed to the dialog — `entry` non-null = edit mode, null = create mode. */
export interface AddStatDialogData {
  entry: StatEntry | null;
}

/**
 * Form model — the Signal Forms tree's source of truth. Numbers are nullable (empty until typed) ;
 * booleans default false (the manual entry answers the setup flags). The output [StatEntryInput]
 * sends `null` for blanks.
 */
interface StatFormModel {
  tradeDate: Date;
  ticker: string;
  gapUpPercent: number | null;
  openPrice: number | null;
  floatSharesMillions: number | null;
  institutionsPercent: number | null;
  instOver20: boolean;
  under1Dollar: boolean;
  ssr: boolean;
  entryAfter11am: boolean;
  highPrice: number | null;
  lodPrice: number | null;
  eodPrice: number | null;
  note: string;
}

/**
 * Dialog form for creating / editing a **user-owned** stat row — built on Signal Forms (same
 * convention as the journal's `AddTradeDialog`). Two sections : the setup (date / ticker / gap / open
 * required, float / institutions / flags optional) and the EOD outcome (high / LOD / EOD, filled at
 * end of day). Returns the domain [StatEntryInput] (`source = MANUAL`) on close ; the derived
 * `%push` / `%LOD` / `%EOD` are computed server-side from the levels.
 *
 * Datepicker + number-mask inputs are pushed into the model imperatively (their CVAs clash with
 * `[formField]`), same workaround as `AddTradeDialog`.
 */
@Component({
  selector: 'app-add-stat-dialog',
  imports: [
    FormField,
    StbButtonModule,
    StbCheckboxModule,
    StbDatePickerModule,
    StbDialogModule,
    StbDividerModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbProgressSpinnerModule,
    NumberMaskDirective,
    TranslatePipe,
  ],
  templateUrl: './add-stat-dialog.html',
  styleUrl: './add-stat-dialog.scss',
})
export class AddStatDialog {
  private readonly dialogRef =
    inject<MatDialogRef<AddStatDialog, StatEntryInput | undefined>>(MatDialogRef);
  private readonly data = inject<AddStatDialogData>(MAT_DIALOG_DATA);

  readonly isEdit = computed(() => this.data.entry !== null);
  readonly submitting = signal(false);

  readonly model = signal<StatFormModel>(this.initialModel());

  readonly statForm = form(this.model, (path) => {
    required(path.tradeDate);
    required(path.ticker);
    maxLength(path.ticker, 20);
  });

  submit(): void {
    if (!this.statForm().valid()) {
      this.statForm().markAsTouched();
      return;
    }
    const v = this.model();
    const input: StatEntryInput = {
      tradeDate: v.tradeDate,
      ticker: v.ticker,
      gapUpPercent: v.gapUpPercent,
      openPrice: v.openPrice,
      floatSharesMillions: v.floatSharesMillions,
      institutionsPercent: v.institutionsPercent,
      instOver20: v.instOver20,
      under1Dollar: v.under1Dollar,
      ssr: v.ssr,
      entryAfter11am: v.entryAfter11am,
      highPrice: v.highPrice,
      lodPrice: v.lodPrice,
      eodPrice: v.eodPrice,
      note: v.note || null,
      source: 'MANUAL',
    };
    this.dialogRef.close(input);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  // ---- Imperative setters — datepicker + number-mask CVAs clash with `[formField]`. ----

  setTradeDate(d: Date | null): void {
    this.model.update((m) => ({ ...m, tradeDate: d ?? new Date() }));
  }

  setGapUpPercent(n: number | null): void {
    this.model.update((m) => ({ ...m, gapUpPercent: n }));
  }

  setOpenPrice(n: number | null): void {
    this.model.update((m) => ({ ...m, openPrice: n }));
  }

  setFloatSharesMillions(n: number | null): void {
    this.model.update((m) => ({ ...m, floatSharesMillions: n }));
  }

  setInstitutionsPercent(n: number | null): void {
    this.model.update((m) => ({ ...m, institutionsPercent: n }));
  }

  setHighPrice(n: number | null): void {
    this.model.update((m) => ({ ...m, highPrice: n }));
  }

  setLodPrice(n: number | null): void {
    this.model.update((m) => ({ ...m, lodPrice: n }));
  }

  setEodPrice(n: number | null): void {
    this.model.update((m) => ({ ...m, eodPrice: n }));
  }

  private initialModel(): StatFormModel {
    const e = this.data.entry;
    if (!e) {
      return {
        tradeDate: new Date(),
        ticker: '',
        gapUpPercent: null,
        openPrice: null,
        floatSharesMillions: null,
        institutionsPercent: null,
        instOver20: false,
        under1Dollar: false,
        ssr: false,
        entryAfter11am: false,
        highPrice: null,
        lodPrice: null,
        eodPrice: null,
        note: '',
      };
    }
    return {
      tradeDate: e.tradeDate,
      ticker: e.ticker,
      gapUpPercent: e.gapUpPercent,
      openPrice: e.openPrice,
      floatSharesMillions: e.floatSharesMillions,
      institutionsPercent: e.institutionsPercent,
      instOver20: e.instOver20 ?? false,
      under1Dollar: e.under1Dollar ?? false,
      ssr: e.ssr ?? false,
      entryAfter11am: e.entryAfter11am ?? false,
      highPrice: e.highPrice,
      lodPrice: e.lodPrice,
      eodPrice: e.eodPrice,
      note: e.note ?? '',
    };
  }
}
