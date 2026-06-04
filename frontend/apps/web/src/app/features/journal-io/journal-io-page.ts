import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { format } from 'date-fns';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbCardModule,
  StbIconModule,
  StbProgressSpinnerModule,
} from '@portfolioai/ui';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ImportResult, JournalRepository } from '../../core/api/journal/journal.repository';

type ImportStep = 'idle' | 'uploading' | 'success' | 'failed';

/**
 * Journal import / export landing page. **v1 ships export + import** — both flow through
 * the same backend CSV contract (`TradeEntryCsvEncoder` / `TradeEntryCsvDecoder`) so a file
 * exported here can be re-imported as-is without manual mapping.
 *
 * The download trick : ask the repository for a `Blob`, wrap it in an object URL, create an
 * invisible `<a download="...">`, click it, then revoke the URL. Cross-browser safe — no
 * dedicated File System Access API needed.
 *
 * The import : drop-zone (drag a single `.csv` file) **or** click-to-browse hidden file
 * input. The atomic-batch contract is enforced server-side : if any row fails to decode, the
 * whole upload is rejected and the per-row errors land in the result panel.
 */
@Component({
  selector: 'app-journal-io-page',
  standalone: true,
  imports: [StbButtonModule, StbCardModule, StbIconModule, StbProgressSpinnerModule, TranslatePipe],
  templateUrl: './journal-io-page.html',
  styleUrl: './journal-io-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JournalIoPage {
  private readonly repo = inject(JournalRepository);
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
    this.repo.exportCsv().subscribe({
      next: (blob: Blob) => {
        triggerBlobDownload(blob, `journal-export-${format(new Date(), 'yyyy-MM-dd')}.csv`);
        this.exporting.set(false);
        this.snackBar.open(this.translate.instant('journalIo.export.success'), undefined, {
          duration: 3000,
          panelClass: 'stb-snack-bar--success',
        });
      },
      error: () => {
        this.exporting.set(false);
        this.snackBar.open(this.translate.instant('journalIo.export.error'), undefined, {
          duration: 5000,
          panelClass: 'stb-snack-bar--error',
        });
      },
    });
  }

  // ============================================================================
  // Import — drop zone
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
  // Import — file input fallback
  // ============================================================================
  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = pickFirstCsv(input.files);
    input.value = ''; // allow re-picking the same filename
    if (file) this.uploadFile(file);
  }

  // ============================================================================
  // Import — common
  // ============================================================================
  private uploadFile(file: File): void {
    this.importStep.set('uploading');
    this.lastResult.set(null);
    this.repo.importCsv(file).subscribe({
      next: (result) => {
        this.lastResult.set(result);
        if (result.errors.length === 0) {
          this.importStep.set('success');
          this.snackBar.open(
            this.translate.instant('journalIo.import.success', { count: result.created }),
            undefined,
            { duration: 3000, panelClass: 'stb-snack-bar--success' },
          );
        } else {
          this.importStep.set('failed');
          this.snackBar.open(
            this.translate.instant('journalIo.import.failed', { count: result.errors.length }),
            undefined,
            { duration: 5000, panelClass: 'stb-snack-bar--error' },
          );
        }
      },
      error: () => {
        this.importStep.set('failed');
        this.lastResult.set({
          parsed: 0,
          created: 0,
          errors: [{ line: 0, message: this.translate.instant('journalIo.import.errorNetwork') }],
        });
        this.snackBar.open(this.translate.instant('journalIo.import.errorNetwork'), undefined, {
          duration: 5000,
          panelClass: 'stb-snack-bar--error',
        });
      },
    });
  }

  resetImport(): void {
    this.importStep.set('idle');
    this.lastResult.set(null);
  }
}

/**
 * Picks the **first** `.csv` file from a `FileList`, ignoring non-CSV drops. v1 only handles
 * single-file imports ; if the user drops several files we silently keep the first one (the
 * batch flow can come later if a real need surfaces).
 */
function pickFirstCsv(files: FileList | null | undefined): File | null {
  if (!files || files.length === 0) return null;
  for (const f of Array.from(files)) {
    if (f.name.toLowerCase().endsWith('.csv')) return f;
  }
  return null;
}

/**
 * Forces a browser download for a `Blob`. The pattern is the only cross-browser way to
 * trigger a "save as" without depending on the File System Access API (not in Safari / FF).
 * Object URLs leak memory until revoked — `revokeObjectURL` runs on the next tick.
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
