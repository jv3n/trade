import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * The app's feedback toasts — the only way a page shows one. A success stays 3 s, an error 5 s,
 * each with its lib variant (`stb-snack-bar--success` / `--error`, cf. `snack-bar.scss`).
 *
 * The lib has no i18n : the caller passes the message already translated.
 *
 * ```ts
 * private readonly toasts = inject(StbToast);
 * this.toasts.success(this.translate.instant('journal.snackbar.deleteSuccess', { ticker }));
 * ```
 */
@Injectable({ providedIn: 'root' })
export class StbToast {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.show(message, 'success', 3000);
  }

  error(message: string): void {
    this.show(message, 'error', 5000);
  }

  private show(message: string, variant: 'success' | 'error', duration: number): void {
    this.snackBar.open(message, undefined, { duration, panelClass: `stb-snack-bar--${variant}` });
  }
}
