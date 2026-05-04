import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PortfolioRepository, CsvImportPreview } from '../../../core/portfolio.repository';

type ImportStep =
  | 'idle'
  | 'previewing'
  | 'preview'
  | 'importing'
  | 'batch-ready'
  | 'batch-importing'
  | 'done'
  | 'error';

@Component({
  selector: 'app-csv-import',
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule, TranslatePipe],
  templateUrl: './csv-import.html',
  styleUrl: './csv-import.scss',
})
export class CsvImport {
  private readonly portfolioRepository = inject(PortfolioRepository);
  private readonly translate = inject(TranslateService);

  imported = output<void>();

  step = signal<ImportStep>('idle');
  preview = signal<CsvImportPreview | null>(null);
  error = signal<string | null>(null);
  pendingFile = signal<File | null>(null);
  pendingFiles = signal<File[]>([]);
  batchIndex = signal(0);
  dragging = signal(false);
  /**
   * Aggregated result of the latest import (single or batch). Lets the "done" banner surface
   * the lifecycle counters — `positionsClosed` / `positionsReopened` from V5 — so the user sees
   * at a glance whether the import sold/re-bought what they expected.
   */
  lastResult = signal<{
    totalImported: number;
    positionsClosed: number;
    positionsReopened: number;
  } | null>(null);

  // ---- Drag & drop ----

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
      f.name.toLowerCase().endsWith('.csv'),
    );
    if (files.length === 0) return;
    if (files.length === 1) this.handleFile(files[0]);
    else this.handleBatch(files);
  }

  // ---- File input (click) ----

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    if (files.length === 1) this.handleFile(files[0]);
    else this.handleBatch(files);
  }

  // ---- Single file ----

  private handleFile(file: File) {
    this.pendingFile.set(file);
    this.step.set('previewing');
    this.error.set(null);

    this.portfolioRepository.previewCsvImport(file).subscribe({
      next: (preview) => {
        this.preview.set(preview);
        this.step.set('preview');
      },
      error: () => {
        this.error.set(this.translate.instant('csvImport.errors.preview'));
        this.step.set('error');
      },
    });
  }

  confirm() {
    const file = this.pendingFile();
    if (!file) return;
    this.step.set('importing');
    this.portfolioRepository.confirmCsvImport(file).subscribe({
      next: (result) => {
        this.lastResult.set({
          totalImported: result.totalImported,
          positionsClosed: result.positionsClosed,
          positionsReopened: result.positionsReopened,
        });
        this.step.set('done');
        this.imported.emit();
      },
      error: () => {
        this.error.set(this.translate.instant('csvImport.errors.import'));
        this.step.set('error');
      },
    });
  }

  // ---- Batch ----
  // TODO: batch import flow à revoir — besoin pas encore stabilisé

  private handleBatch(files: File[]) {
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
    this.pendingFiles.set(sorted);
    this.batchIndex.set(0);
    this.error.set(null);
    this.step.set('batch-ready');
  }

  confirmBatch() {
    this.step.set('batch-importing');
    this.batchIndex.set(0);
    // Reset agrégat avant la première itération du batch.
    this.lastResult.set({ totalImported: 0, positionsClosed: 0, positionsReopened: 0 });
    this.importNext();
  }

  private importNext() {
    const files = this.pendingFiles();
    const index = this.batchIndex();
    if (index >= files.length) {
      this.step.set('done');
      this.imported.emit();
      return;
    }
    this.portfolioRepository.confirmCsvImport(files[index]).subscribe({
      next: (result) => {
        const acc = this.lastResult() ?? {
          totalImported: 0,
          positionsClosed: 0,
          positionsReopened: 0,
        };
        this.lastResult.set({
          totalImported: acc.totalImported + result.totalImported,
          positionsClosed: acc.positionsClosed + result.positionsClosed,
          positionsReopened: acc.positionsReopened + result.positionsReopened,
        });
        this.batchIndex.set(index + 1);
        this.importNext();
      },
      error: () => {
        this.error.set(
          this.translate.instant('csvImport.errors.batchItem', { name: files[index].name }),
        );
        this.step.set('error');
      },
    });
  }

  // ---- Helpers ----

  extractDate(filename: string): string | null {
    return filename.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  }

  cancel() {
    this.step.set('idle');
    this.preview.set(null);
    this.pendingFile.set(null);
    this.pendingFiles.set([]);
    this.error.set(null);
    this.lastResult.set(null);
  }

  reset() {
    this.cancel();
  }
}
