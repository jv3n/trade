import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AnalysisService, Recommendation, RecommendationStatus } from '../core/analysis.service';

const STATUS_LABELS: Record<RecommendationStatus, string> = {
  PENDING: 'En attente',
  APPLIED: 'Appliquée',
  IGNORED: 'Ignorée',
  EVALUATED: 'Évaluée',
};

@Component({
  selector: 'app-history',
  imports: [CommonModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History implements OnInit {
  private readonly analysisService = inject(AnalysisService);

  recommendations = signal<Recommendation[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  filterPortfolio = signal<string>('all');
  filterStatus = signal<string>('all');
  expandedIds = signal<Set<string>>(new Set());

  readonly statuses: Array<{ value: string; label: string }> = [
    { value: 'all', label: 'Toutes' },
    { value: 'PENDING', label: 'En attente' },
    { value: 'APPLIED', label: 'Appliquées' },
    { value: 'IGNORED', label: 'Ignorées' },
    { value: 'EVALUATED', label: 'Évaluées' },
  ];

  portfolios = computed(() => {
    const map = new Map<string, string>();
    this.recommendations().forEach(r => map.set(r.portfolioId, r.portfolioName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  });

  filtered = computed(() =>
    this.recommendations().filter(r => {
      const matchPortfolio = this.filterPortfolio() === 'all' || r.portfolioId === this.filterPortfolio();
      const matchStatus = this.filterStatus() === 'all' || r.status === this.filterStatus();
      return matchPortfolio && matchStatus;
    })
  );

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.analysisService.getAllRecommendations().subscribe({
      next: recs => {
        this.recommendations.set(recs);
        this.loading.set(false);
      },
      error: () => {
        this.error.set("Erreur lors du chargement de l'historique");
        this.loading.set(false);
      },
    });
  }

  toggleExpand(id: string) {
    this.expandedIds.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  actionClass(action: string): string {
    return { BUY: 'action-buy', SELL: 'action-sell', HOLD: 'action-hold', REDUCE: 'action-reduce' }[action] ?? '';
  }

  statusLabel(status: RecommendationStatus): string {
    return STATUS_LABELS[status] ?? status;
  }
}
