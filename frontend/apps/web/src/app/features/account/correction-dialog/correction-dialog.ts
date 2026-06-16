import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbDatePickerModule,
  StbDialogModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
} from '@portfolioai/ui';
import { CorrectionInput } from '../../../core/api/account/account.model';
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';

interface CorrectionFormModel {
  targetBalance: number | null;
  valueDate: Date;
  note: string;
}

/**
 * Balance-correction dialog — the user enters the **real** balance read from their broker ; the
 * backend records the signed `target − current` delta as an ADJUSTMENT. The target can be any value
 * (negative allowed — a margin account can go negative), validated by hand on submit.
 */
@Component({
  selector: 'app-correction-dialog',
  imports: [
    FormField,
    StbButtonModule,
    StbDatePickerModule,
    StbDialogModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    NumberMaskDirective,
    TranslatePipe,
  ],
  templateUrl: './correction-dialog.html',
  styleUrl: './correction-dialog.scss',
})
export class CorrectionDialog {
  private readonly dialogRef =
    inject<MatDialogRef<CorrectionDialog, CorrectionInput | undefined>>(MatDialogRef);

  readonly submitted = signal(false);

  readonly model = signal<CorrectionFormModel>({
    targetBalance: null,
    valueDate: new Date(),
    note: '',
  });
  readonly correctionForm = form(this.model);

  readonly targetInvalid = computed(() => this.submitted() && this.model().targetBalance === null);

  submit(): void {
    this.submitted.set(true);
    const v = this.model();
    if (v.targetBalance === null) return;
    this.dialogRef.close({
      targetBalance: v.targetBalance,
      valueDate: v.valueDate,
      note: v.note || null,
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  setTargetBalance(n: number | null): void {
    this.model.update((m) => ({ ...m, targetBalance: n }));
  }

  setValueDate(d: Date | null): void {
    this.model.update((m) => ({ ...m, valueDate: d ?? new Date() }));
  }
}
