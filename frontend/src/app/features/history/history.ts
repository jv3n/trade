import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AnalysisRepository,
  Recommendation,
  RecommendationStatus,
} from '../../core/analysis.repository';

@Component({
  selector: 'app-history',
  imports: [CommonModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule, TranslatePipe],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History implements OnInit {
  private readonly analysisRepository = inject(AnalysisRepository);
  private readonly translate = inject(TranslateService);

  recommendations = signal<Recommendation[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  filterPortfolio = signal<string>('all');
  filterStatus = signal<string>('all');
  expandedIds = signal<Set<string>>(new Set());

  /**
   * Filter chips. The `i18nKey` resolves to a `statuses.*_PLURAL` translation in the template
   * (e.g. "Appliquées" / "Applied"). The single-status `statusLabel` below resolves the unsuffixed
   * key when displaying a single recommendation badge.
   */
  readonly statuses: { value: string; i18nKey: string }[] = [
    { value: 'all', i18nKey: 'statuses.all' },
    { value: 'PENDING', i18nKey: 'statuses.PENDING_PLURAL' },
    { value: 'APPLIED', i18nKey: 'statuses.APPLIED_PLURAL' },
    { value: 'IGNORED', i18nKey: 'statuses.IGNORED_PLURAL' },
    { value: 'EVALUATED', i18nKey: 'statuses.EVALUATED_PLURAL' },
  ];

  portfolios = computed(() => {
    const map = new Map<string, string>();
    this.recommendations().forEach((r) => map.set(r.portfolioId, r.portfolioName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  });

  filtered = computed(() =>
    this.recommendations().filter((r) => {
      const matchPortfolio =
        this.filterPortfolio() === 'all' || r.portfolioId === this.filterPortfolio();
      const matchStatus = this.filterStatus() === 'all' || r.status === this.filterStatus();
      return matchPortfolio && matchStatus;
    }),
  );

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.analysisRepository.getAllRecommendations().subscribe({
      next: (recs) => {
        this.recommendations.set(recs);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('history.loading'));
        this.loading.set(false);
      },
    });
  }

  toggleExpand(id: string) {
    this.expandedIds.update((set) => {
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
    return (
      { BUY: 'action-buy', SELL: 'action-sell', HOLD: 'action-hold', REDUCE: 'action-reduce' }[
        action
      ] ?? ''
    );
  }

  statusKey(status: RecommendationStatus): string {
    return `statuses.${status}`;
  }
}
