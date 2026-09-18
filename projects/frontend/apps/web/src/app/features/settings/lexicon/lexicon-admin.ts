import { Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { StbButtonModule, StbIconModule, StbProgressSpinnerModule } from '@portfolioai/ui';
import { EMPTY, catchError, filter, switchMap, tap } from 'rxjs';

import { LexiconEntry, LexiconEntryInput } from '../../../core/api/lexicon/lexicon.model';
import { LexiconRepository } from '../../../core/api/lexicon/lexicon.repository';
import { LexiconDialog, LexiconDialogData } from '../../lexicon/lexicon-dialog/lexicon-dialog';
import { LexiconTable } from '../../lexicon/lexicon-table/lexicon-table';

/**
 * ADMIN lexicon management — the same shared [LexiconTable] as the public `/lexicon` page, but in
 * **editable** mode : an « Add term » header action plus per-row edit / delete that drive the CRUD
 * endpoints (`POST` / `PUT` / `DELETE /api/lexicon`, ADMIN-gated in `SecurityConfig`). Lives under
 * `/settings/lexicon` behind `adminGuard`.
 *
 * Every mutation refetches the full list — the dataset is small, so we trust the server rather than
 * splicing locally.
 */
@Component({
  selector: 'app-lexicon-admin',
  imports: [StbButtonModule, StbIconModule, StbProgressSpinnerModule, TranslatePipe, LexiconTable],
  templateUrl: './lexicon-admin.html',
  styleUrl: './lexicon-admin.scss',
})
export class LexiconAdminPage {
  private readonly repo = inject(LexiconRepository);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly entries = signal<LexiconEntry[]>([]);

  constructor() {
    this.fetch();
  }

  openCreate(): void {
    this.openDialog(null);
  }

  openEdit(entry: LexiconEntry): void {
    this.openDialog(entry);
  }

  delete(entry: LexiconEntry): void {
    const confirmMsg = this.translate.instant('lexicon.confirmDelete', { term: entry.term });
    if (!confirm(confirmMsg)) return;

    this.repo
      .delete(entry.id)
      .pipe(
        tap(() => {
          this.toast('lexicon.snackbar.deleteSuccess', 'success', { term: entry.term });
          this.fetch();
        }),
        catchError(() => {
          this.toast('lexicon.snackbar.deleteError', 'error');
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this.repo.findAll().subscribe({
      next: (rows) => {
        this.entries.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('lexicon.errors.load'));
        this.loading.set(false);
      },
    });
  }

  private openDialog(entry: LexiconEntry | null): void {
    const isUpdate = entry !== null;
    const data: LexiconDialogData = { entry };
    const ref = this.dialog.open<LexiconDialog, LexiconDialogData, LexiconEntryInput | undefined>(
      LexiconDialog,
      { data, width: '560px', maxWidth: '95vw', autoFocus: 'first-tabbable' },
    );
    ref
      .afterClosed()
      .pipe(
        filter((input): input is LexiconEntryInput => !!input),
        switchMap((input) =>
          (isUpdate ? this.repo.update(entry!.id, input) : this.repo.create(input)).pipe(
            tap((saved) => {
              const key = isUpdate
                ? 'lexicon.snackbar.updateSuccess'
                : 'lexicon.snackbar.createSuccess';
              this.toast(key, 'success', { term: saved.term });
              this.fetch();
            }),
            catchError(() => {
              // A 409 (duplicate term) surfaces here too — generic error toast is enough.
              this.toast(
                isUpdate ? 'lexicon.snackbar.updateError' : 'lexicon.snackbar.createError',
                'error',
              );
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }

  private toast(key: string, variant: 'success' | 'error', params?: Record<string, unknown>): void {
    this.snackBar.open(this.translate.instant(key, params), undefined, {
      duration: variant === 'success' ? 3000 : 5000,
      panelClass: `stb-snack-bar--${variant}`,
    });
  }
}
