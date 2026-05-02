import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import {
  SettingsService,
  DataSource,
  SourceCategory,
  SourceTestResult,
} from '../../core/settings.service';

const CATEGORY_LABELS: Record<SourceCategory, string> = {
  RSS: 'Presse & Flux RSS',
  MARKET: 'Données de marché',
  MACRO: 'Indicateurs macro-économiques',
  CRYPTO: 'Crypto',
};

const CATEGORY_ORDER: SourceCategory[] = ['RSS', 'MARKET', 'MACRO', 'CRYPTO'];

@Component({
  selector: 'app-test-sources',
  imports: [CommonModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './test-sources.html',
  styleUrl: './test-sources.scss',
})
export class TestSources implements OnInit {
  private readonly settingsService = inject(SettingsService);

  allSources = signal<DataSource[]>([]);
  selectedCategory = signal<SourceCategory | null>(null);
  selectedId = signal<string | null>(null);
  testing = signal(false);
  result = signal<SourceTestResult | null>(null);

  categories = CATEGORY_ORDER;
  categoryLabels = CATEGORY_LABELS;

  sourcesForCategory = computed(() => {
    const cat = this.selectedCategory();
    if (!cat) return [];
    return this.allSources().filter((s) => s.category === cat && s.enabled);
  });

  selectedSource = computed(
    () => this.allSources().find((s) => s.id === this.selectedId()) ?? null,
  );

  ngOnInit() {
    this.settingsService.getSources().subscribe({
      next: (sources) => this.allSources.set(sources),
    });
  }

  selectCategory(category: string) {
    this.selectedCategory.set((category as SourceCategory) || null);
    this.selectedId.set(null);
    this.result.set(null);
  }

  selectSource(id: string) {
    this.selectedId.set(id || null);
    this.result.set(null);
  }

  test() {
    const id = this.selectedId();
    if (!id || this.testing()) return;
    this.testing.set(true);
    this.result.set(null);

    this.settingsService.testSource(id).subscribe({
      next: (r) => {
        this.result.set(r);
        this.testing.set(false);
      },
      error: () => {
        this.result.set({
          ok: false,
          error: 'Erreur de connexion au backend',
          message: null,
          itemCount: 0,
          items: [],
        });
        this.testing.set(false);
      },
    });
  }
}
