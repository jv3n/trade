import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
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
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './csv-import.html',
  styleUrl: './csv-import.scss',
})
export class CsvImport {
  private readonly portfolioRepository = inject(PortfolioRepository);

  imported = output<void>();

  step = signal<ImportStep>('idle');
  preview = signal<CsvImportPreview | null>(null);
  error = signal<string | null>(null);
  pendingFile = signal<File | null>(null);
  pendingFiles = signal<File[]>([]);
  batchIndex = signal(0);
  dragging = signal(false);

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
    files.length === 1 ? this.handleFile(files[0]) : this.handleBatch(files);
  }

  // ---- File input (click) ----

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    files.length === 1 ? this.handleFile(files[0]) : this.handleBatch(files);
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
        this.error.set(
          "Impossible de lire le fichier. Vérifiez qu'il s'agit bien d'un export Wealthsimple (positions).",
        );
        this.step.set('error');
      },
    });
  }

  confirm() {
    const file = this.pendingFile();
    if (!file) return;
    this.step.set('importing');
    this.portfolioRepository.confirmCsvImport(file).subscribe({
      next: () => {
        this.step.set('done');
        this.imported.emit();
      },
      error: () => {
        this.error.set("L'import a échoué. Réessayez.");
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
      next: () => {
        this.batchIndex.set(index + 1);
        this.importNext();
      },
      error: () => {
        this.error.set(`Échec de l'import de « ${files[index].name} ».`);
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
  }

  reset() {
    this.cancel();
  }
}
