import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PortfolioService, CsvImportPreview } from '../../core/portfolio.service';

type ImportStep = 'idle' | 'previewing' | 'preview' | 'importing' | 'done' | 'error';

@Component({
  selector: 'app-csv-import',
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './csv-import.html',
  styleUrl: './csv-import.scss',
})
export class CsvImport {
  private readonly portfolioService = inject(PortfolioService);

  imported = output<void>();

  step = signal<ImportStep>('idle');
  preview = signal<CsvImportPreview | null>(null);
  error = signal<string | null>(null);
  pendingFile = signal<File | null>(null);
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
    const file = event.dataTransfer?.files?.[0];
    if (file) this.handleFile(file);
  }

  // ---- File input (click) ----

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    this.handleFile(file);
  }

  // ---- Core ----

  private handleFile(file: File) {
    this.pendingFile.set(file);
    this.step.set('previewing');
    this.error.set(null);

    this.portfolioService.previewCsvImport(file).subscribe({
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
    this.portfolioService.confirmCsvImport(file).subscribe({
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

  cancel() {
    this.step.set('idle');
    this.preview.set(null);
    this.pendingFile.set(null);
    this.error.set(null);
  }

  reset() {
    this.cancel();
  }
}
