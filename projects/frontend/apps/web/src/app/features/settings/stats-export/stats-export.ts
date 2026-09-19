import { Component, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbCardModule,
  StbIconModule,
  StbProgressSpinnerModule,
} from '@portfolioai/ui';
import { format } from 'date-fns';
import { EMPTY, catchError, tap } from 'rxjs';

import { StatsRepository } from '../../../core/api/stats/stats.repository';

/**
 * `/settings/stats-export` — CSV export of the caller's stats, in the back-office settings next to
 * the journal's import / export.
 *
 * Export only : a stat is born from a candidate (`mockup/PARCOURS.md`, step 2), so there is no CSV
 * import to feed the sheet. The file is a spreadsheet-friendly copy — premarket block, session
 * block and flags, no percentage (they are derived from the prices) — and a stat still to complete
 * comes out with its five session cells empty.
 *
 * The download reuses the same blob trick as `JournalIoPage.download`.
 */
@Component({
  selector: 'app-stats-export',
  imports: [StbButtonModule, StbCardModule, StbIconModule, StbProgressSpinnerModule, TranslatePipe],
  templateUrl: './stats-export.html',
  styleUrl: './stats-export.scss',
})
export class StatsExportPage {
  private readonly repo = inject(StatsRepository);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);

  readonly exporting = signal(false);

  download(): void {
    this.exporting.set(true);
    this.repo
      .exportCsv()
      .pipe(
        tap((blob: Blob) => {
          triggerBlobDownload(blob, `stats-export-${format(new Date(), 'yyyy-MM-dd')}.csv`);
          this.exporting.set(false);
          this.toast('settings.statsExportPage.export.success', 'success');
        }),
        catchError(() => {
          this.exporting.set(false);
          this.toast('settings.statsExportPage.export.error', 'error');
          return EMPTY;
        }),
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

/** Hands the blob to the browser through a throwaway anchor, then revokes the object URL. */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
