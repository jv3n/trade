import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { SettingsService, DataSource, SourceCategory } from '../core/settings.service';

const CATEGORY_LABELS: Record<SourceCategory, string> = {
  RSS: 'Presse & Flux RSS',
  MARKET: 'Données de marché',
  MACRO: 'Indicateurs macro-économiques',
  CRYPTO: 'Crypto',
};

const CATEGORY_ORDER: SourceCategory[] = ['RSS', 'MARKET', 'MACRO', 'CRYPTO'];

@Component({
  selector: 'app-settings',
  imports: [CommonModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  private readonly settingsService = inject(SettingsService);

  sources = signal<DataSource[]>([]);
  sourcesLoading = signal(true);
  sourcesError = signal<string | null>(null);
  savingIds = signal<Set<string>>(new Set());

  categories = CATEGORY_ORDER;
  categoryLabels = CATEGORY_LABELS;

  ngOnInit() {
    this.loadSources();
  }

  loadSources() {
    this.settingsService.getSources().subscribe({
      next: (sources) => {
        this.sources.set(sources);
        this.sourcesLoading.set(false);
      },
      error: () => {
        this.sourcesError.set('Impossible de charger les sources.');
        this.sourcesLoading.set(false);
      },
    });
  }

  sourcesByCategory(category: SourceCategory): DataSource[] {
    return this.sources().filter((s) => s.category === category);
  }

  enabledCount(category: SourceCategory): number {
    return this.sourcesByCategory(category).filter((s) => s.enabled).length;
  }

  isSaving(id: string): boolean {
    return this.savingIds().has(id);
  }

  toggle(source: DataSource) {
    if (this.isSaving(source.id)) return;
    const newEnabled = !source.enabled;
    this.sources.update((list) =>
      list.map((s) => (s.id === source.id ? { ...s, enabled: newEnabled } : s)),
    );
    this.savingIds.update((set) => new Set([...set, source.id]));

    this.settingsService.updateEnabled(source.id, newEnabled).subscribe({
      next: (updated) => {
        this.sources.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
        this.savingIds.update((set) => {
          const n = new Set(set);
          n.delete(source.id);
          return n;
        });
      },
      error: () => {
        this.sources.update((list) =>
          list.map((s) => (s.id === source.id ? { ...s, enabled: source.enabled } : s)),
        );
        this.savingIds.update((set) => {
          const n = new Set(set);
          n.delete(source.id);
          return n;
        });
        this.sourcesError.set(`Impossible de modifier "${source.name}".`);
      },
    });
  }
}
