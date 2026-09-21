import { Component, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  MatDialog,
  StbButtonModule,
  StbIconModule,
  StbProgressSpinnerModule,
  StbToast,
} from '@portfolioai/ui';
import { EMPTY, catchError, filter, switchMap, tap } from 'rxjs';

import { LexiconEntry, LexiconEntryInput } from '../../../core/api/lexicon/lexicon.model';
import { LexiconRepository } from '../../../core/api/lexicon/lexicon.repository';
import { ConfirmService } from '../../../core/app-state/confirm.service';
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
  private readonly confirm = inject(ConfirmService);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(StbToast);

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
    this.confirm
      .ask('lexicon.confirmDelete', { params: { term: entry.term }, variant: 'danger' })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.delete(entry.id)),
        tap(() => {
          this.toasts.success(
            this.translate.instant('lexicon.snackbar.deleteSuccess', { term: entry.term }),
          );
          this.fetch();
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('lexicon.snackbar.deleteError'));
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
              this.toasts.success(this.translate.instant(key, { term: saved.term }));
              this.fetch();
            }),
            catchError(() => {
              // A 409 (duplicate term) surfaces here too — generic error toast is enough.
              this.toasts.error(
                this.translate.instant(
                  isUpdate ? 'lexicon.snackbar.updateError' : 'lexicon.snackbar.createError',
                ),
              );
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }
}
