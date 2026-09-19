import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';
import { StbConfirmDialog, StbConfirmDialogData } from './confirm-dialog';

/**
 * Opens a [StbConfirmDialog] and emits **once** : `true` when the user confirms, `false` on
 * Cancel / Esc / backdrop click. Observable-based so call sites stay one pipe :
 *
 * ```ts
 * this.confirm
 *   .open({ title, message, confirmLabel, cancelLabel, variant: 'danger' })
 *   .pipe(filter(Boolean), switchMap(() => this.repo.delete(id)))
 *   .subscribe();
 * ```
 */
@Injectable({ providedIn: 'root' })
export class StbConfirm {
  private readonly dialog = inject(MatDialog);

  open(data: StbConfirmDialogData): Observable<boolean> {
    return this.dialog
      .open<StbConfirmDialog, StbConfirmDialogData, boolean>(StbConfirmDialog, {
        data,
        width: '440px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .pipe(map((result) => result === true));
  }
}
