import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';
import {
  StbConfirmChoice,
  StbConfirmDialog,
  StbConfirmDialogData,
  StbConfirmPick,
} from './confirm-dialog';

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
    return this.afterClosed(data).pipe(map((result) => result === true));
  }

  /**
   * [open] with a pick under the message (a rejection reason…) : emits once, the pick on confirm —
   * null when « — » is left — with its note, or `{ confirmed: false }` on Cancel / Esc / backdrop
   * click.
   */
  choose(data: StbConfirmDialogData & { choice: StbConfirmChoice }): Observable<StbConfirmPick> {
    return this.afterClosed(data).pipe(
      map((result): StbConfirmPick =>
        result && typeof result === 'object'
          ? { confirmed: true, value: result.value, note: result.note }
          : { confirmed: false },
      ),
    );
  }

  private afterClosed(data: StbConfirmDialogData) {
    return this.dialog
      .open<
        StbConfirmDialog,
        StbConfirmDialogData,
        true | { value: string | null; note: string | null }
      >(StbConfirmDialog, { data, width: '440px', maxWidth: 'calc(100vw - 32px)' })
      .afterClosed();
  }
}
