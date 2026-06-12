import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { StbButtonModule, StbDialogModule, StbIconModule } from '@portfolioai/ui';

/** Radar row context shown in the confirmation modal — only the fields a radar pick carries. */
export interface ConfirmAddStatData {
  ticker: string;
  gapPct: number;
  price: number;
}

/**
 * Confirmation modal for the radar « Add stat » button. Pure confirm/cancel — it shows the ticker,
 * gap and price about to be seeded as a stat row and returns `true` on confirm, `false`/`undefined`
 * on cancel. The actual create call lives in the radar page so the dialog stays side-effect-free
 * (same split as the lexicon dialog).
 */
@Component({
  selector: 'app-confirm-add-stat-dialog',
  imports: [DecimalPipe, StbButtonModule, StbDialogModule, StbIconModule, TranslatePipe],
  templateUrl: './confirm-add-stat-dialog.html',
  styleUrl: './confirm-add-stat-dialog.scss',
})
export class ConfirmAddStatDialog {
  private readonly dialogRef = inject<MatDialogRef<ConfirmAddStatDialog, boolean>>(MatDialogRef);
  readonly data = inject<ConfirmAddStatData>(MAT_DIALOG_DATA);

  confirm(): void {
    this.dialogRef.close(true);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
