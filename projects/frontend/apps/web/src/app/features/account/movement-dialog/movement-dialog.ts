import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbDatePickerModule,
  StbDialogModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbSelectModule,
} from '@portfolioai/ui';
import {
  AccountMovement,
  AccountMovementInput,
  AccountMovementType,
  MANUAL_MOVEMENT_TYPES,
} from '../../../core/api/account/account.model';
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';

/** Data passed to the dialog — `movement` non-null = edit mode, null = create mode. */
export interface MovementDialogData {
  movement: AccountMovement | null;
}

interface MovementFormModel {
  type: AccountMovementType;
  amount: number | null;
  valueDate: Date;
  note: string;
}

/**
 * Add / edit dialog for a manual cash movement (DEPOSIT / WITHDRAWAL). Built on Signal Forms for the
 * type select + note ; the amount (`appNumberMask`) and date (`MatDatepicker`) are pushed
 * imperatively because their CVAs clash with `[formField]` (same pattern as `AddTradeDialog`).
 *
 * [amount] is a **positive magnitude** — the backend applies the sign from the type. On edit the
 * type is fixed (a deposit can't morph into a withdrawal) and the amount is shown as its magnitude.
 */
@Component({
  selector: 'app-movement-dialog',
  imports: [
    FormField,
    StbButtonModule,
    StbDatePickerModule,
    StbDialogModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbSelectModule,
    NumberMaskDirective,
    TranslatePipe,
  ],
  templateUrl: './movement-dialog.html',
  styleUrl: './movement-dialog.scss',
})
export class MovementDialog {
  private readonly dialogRef =
    inject<MatDialogRef<MovementDialog, AccountMovementInput | undefined>>(MatDialogRef);
  private readonly data = inject<MovementDialogData>(MAT_DIALOG_DATA);

  readonly isEdit = computed(() => this.data.movement !== null);
  readonly manualTypes = MANUAL_MOVEMENT_TYPES;
  readonly submitted = signal(false);

  readonly model = signal<MovementFormModel>(this.initialModel());
  readonly movementForm = form(this.model);

  /** Amount is validated by hand (it's an imperative field) — flagged once the user submits. */
  readonly amountInvalid = computed(() => {
    const a = this.model().amount;
    return this.submitted() && (a === null || a <= 0);
  });

  submit(): void {
    this.submitted.set(true);
    const v = this.model();
    if (v.amount === null || v.amount <= 0) return;
    this.dialogRef.close({
      type: v.type,
      amount: v.amount,
      valueDate: v.valueDate,
      note: v.note || null,
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  setAmount(n: number | null): void {
    this.model.update((m) => ({ ...m, amount: n }));
  }

  setValueDate(d: Date | null): void {
    this.model.update((m) => ({ ...m, valueDate: d ?? new Date() }));
  }

  private initialModel(): MovementFormModel {
    const mv = this.data.movement;
    if (!mv) {
      return { type: 'DEPOSIT', amount: null, valueDate: new Date(), note: '' };
    }
    return {
      type: mv.type,
      amount: Math.abs(mv.amount), // edit shows the positive magnitude
      valueDate: mv.valueDate,
      note: mv.note ?? '',
    };
  }
}
