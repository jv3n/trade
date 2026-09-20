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
import { EMPTY, Observable, catchError, tap } from 'rxjs';

import { JournalRepository } from '../../../core/api/journal/journal.repository';
import { StatsRepository } from '../../../core/api/stats/stats.repository';

/** The two sheets this page can hand over as a CSV. */
type Dataset = 'journal' | 'stats';

/**
 * `/settings/data` — « Données », the back-office corner where the journal and the stats sheet are
 * downloaded as CSV (`mockup/parametres.html` › Données).
 *
 * **Export only** (#196) : neither sheet can be fed from a file. A trade is born from a stat and a
 * stat from a candidate, so an importer would be a second way in, competing with the daily flow
 * the whole app is built around. The files are spreadsheet-friendly copies — a backup and a place
 * to run the odd pivot table, not an exchange format.
 *
 * Both downloads share the blob trick : ask the repository for a `Blob`, wrap it in an object URL,
 * click a throwaway `<a download>`, revoke the URL.
 */
@Component({
  selector: 'app-data',
  imports: [StbButtonModule, StbCardModule, StbIconModule, StbProgressSpinnerModule, TranslatePipe],
  templateUrl: './data.html',
  styleUrl: './data.scss',
})
export class DataPage {
  private readonly journalRepo = inject(JournalRepository);
  private readonly statsRepo = inject(StatsRepository);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);

  /** Which download is in flight — null when idle. The two buttons are independent. */
  readonly exporting = signal<Dataset | null>(null);

  downloadJournal(): void {
    this.download('journal', this.journalRepo.exportCsv());
  }

  downloadStats(): void {
    this.download('stats', this.statsRepo.exportCsv());
  }

  private download(dataset: Dataset, source: Observable<Blob>): void {
    this.exporting.set(dataset);
    source
      .pipe(
        tap((blob: Blob) => {
          triggerBlobDownload(blob, `${dataset}-export-${format(new Date(), 'yyyy-MM-dd')}.csv`);
          this.exporting.set(null);
          this.toast(`settings.dataPage.${dataset}.success`, 'success');
        }),
        catchError(() => {
          this.exporting.set(null);
          this.toast(`settings.dataPage.${dataset}.error`, 'error');
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
