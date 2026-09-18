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

import { ImportResult, StatsRepository } from '../../../core/api/stats/stats.repository';

type ImportStep = 'idle' | 'uploading' | 'success' | 'failed';

/**
 * `/settings/stats-import` — **ADMIN-only** CSV import + export of the trade-stats dataset. Gated by
 * `adminGuard` on the route (and the nav entry only renders for admins) ; this is a data-injection
 * surface, not a per-user feature, hence its home in the back-office settings rather than a
 * top-level route.
 *
 * Import : the source of truth is the Google-Sheet → `scripts/stats` → `stats-data-prod.csv`
 * pipeline, and this page pushes that CSV into Postgres. Export : the whole table back out as a CSV
 * in the exact import layout (computed `%push` / `%LOD` / `%EOD` omitted) — roundtrip-safe.
 *
 * The import flow mirrors `JournalIoPage.uploadFile` : drop-zone (drag a single `.csv`) **or**
 * click-to-browse. The atomic-batch contract is enforced server-side — if any row fails to decode,
 * the whole upload is rejected and the per-row errors land in the result panel. The export reuses
 * the same blob-download trick as `JournalIoPage.download`.
 */
@Component({
  selector: 'app-stats-import',
  imports: [StbButtonModule, StbCardModule, StbIconModule, StbProgressSpinnerModule, TranslatePipe],
  templateUrl: './stats-import.html',
  styleUrl: './stats-import.scss',
})
export class StatsImportPage {
  private readonly repo = inject(StatsRepository);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);

  // ---- Export state ----
  readonly exporting = signal(false);

  // ---- Import state ----
  readonly importStep = signal<ImportStep>('idle');
  readonly dragging = signal(false);
  readonly lastResult = signal<ImportResult | null>(null);

  // ============================================================================
  // Export
  // ============================================================================
  download(): void {
    this.exporting.set(true);
    this.repo
      .exportCsv()
      .pipe(
        tap((blob: Blob) => {
          triggerBlobDownload(blob, `stats-export-${format(new Date(), 'yyyy-MM-dd')}.csv`);
          this.exporting.set(false);
          this.toast('settings.statsImportPage.export.success', 'success');
        }),
        catchError(() => {
          this.exporting.set(false);
          this.toast('settings.statsImportPage.export.error', 'error');
          return EMPTY;
        }),
      )
      .subscribe();
  }

  // ============================================================================
  // Drop zone
  // ============================================================================
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set(false);
    const file = pickFirstCsv(event.dataTransfer?.files);
    if (file) this.uploadFile(file);
  }

  // ============================================================================
  // File input fallback
  // ============================================================================
  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = pickFirstCsv(input.files);
    input.value = ''; // allow re-picking the same filename
    if (file) this.uploadFile(file);
  }

  // ============================================================================
  // Common
  // ============================================================================
  private uploadFile(file: File): void {
    this.importStep.set('uploading');
    this.lastResult.set(null);
    this.repo
      .importCsv(file)
      .pipe(
        tap((result) => {
          this.lastResult.set(result);
          if (result.errors.length === 0) {
            this.importStep.set('success');
            this.toast('settings.statsImportPage.import.success', 'success', {
              count: result.created,
            });
          } else {
            this.importStep.set('failed');
            this.toast('settings.statsImportPage.import.failed', 'error', {
              count: result.errors.length,
            });
          }
        }),
        catchError(() => {
          this.importStep.set('failed');
          this.lastResult.set({
            parsed: 0,
            created: 0,
            errors: [
              {
                line: 0,
                message: this.translate.instant('settings.statsImportPage.import.errorNetwork'),
              },
            ],
          });
          this.toast('settings.statsImportPage.import.errorNetwork', 'error');
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /**
   * Snackbar helper — same shape as `JournalIoPage.toast`. `success` lives 3 s, `error` lives 5 s.
   * Variants are the global classes from `libs/ui/src/lib/snack-bar/snack-bar.scss`.
   */
  private toast(key: string, variant: 'success' | 'error', params?: Record<string, unknown>): void {
    this.snackBar.open(this.translate.instant(key, params), undefined, {
      duration: variant === 'success' ? 3000 : 5000,
      panelClass: `stb-snack-bar--${variant}`,
    });
  }

  resetImport(): void {
    this.importStep.set('idle');
    this.lastResult.set(null);
  }
}

/**
 * Picks the **first** `.csv` file from a `FileList`, ignoring non-CSV drops. Single-file import
 * only ; multiple files silently keep the first one.
 */
function pickFirstCsv(files: FileList | null | undefined): File | null {
  if (!files || files.length === 0) return null;
  for (const f of Array.from(files)) {
    if (f.name.toLowerCase().endsWith('.csv')) return f;
  }
  return null;
}

/**
 * Forces a browser download for a `Blob` — same cross-browser trick as `JournalIoPage`. Object URLs
 * leak memory until revoked, so `revokeObjectURL` runs on the next tick.
 */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
