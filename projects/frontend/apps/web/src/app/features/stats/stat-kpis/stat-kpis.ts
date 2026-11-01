import { DecimalPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { StbTooltipModule } from '@portfolioai/ui';
import { StatSummary } from '../../../core/api/stats/stat-entry.model';
import { PluralPipe } from '../../../shared/plural/plural';
import { ShortGainPipe } from '../short-gain.pipe';
import { StatTab, StatView } from '../stats-sheet.rules';
import { DT_DROP_TARGET, DT_REJECTION_CRITERION, GUS_DROP_TARGET } from '../stats.math';

/** The share of the period's stats without a push — the « No push » tab's first card. */
export interface NoPushRate {
  count: number;
  total: number;
  share: number | null;
}

/**
 * The KPI cards above the table : the backend's figures over the filtered set, not the current
 * page, laid out per view.
 */
@Component({
  selector: 'app-stat-kpis',
  imports: [DecimalPipe, PluralPipe, ShortGainPipe, StbTooltipModule, TranslatePipe],
  templateUrl: './stat-kpis.html',
  styleUrl: './stat-kpis.scss',
})
export class StatKpis {
  private readonly translate = inject(TranslateService);

  readonly kpi = input.required<StatSummary>();
  readonly view = input.required<StatView>();
  readonly status = input.required<StatTab>();
  readonly noPushRate = input.required<NoPushRate | null>();

  readonly rejectionCriterion = DT_REJECTION_CRITERION;
  readonly dropTarget = DT_DROP_TARGET;
  readonly gusDropTarget = GUS_DROP_TARGET;

  /**
   * The Sink KPI's sub-label (#729), read on its own axes : the Sinks — those after a retest that
   * took the top among them — then apart, the stats without one by reason, each once it counts one.
   * The two terms add up to the completed stats of [pattern].
   */
  dropSubLabel(kpi: StatSummary, pattern: 'GUS' | 'DT'): string {
    const t = (key: string, params?: object) => this.translate.instant(key, params);
    const reasons: [string, number][] =
      pattern === 'DT'
        ? [
            ['tookTop', kpi.doubleTopsTookTopWithoutDrop],
            ['notRead', kpi.doubleTopsDropNotRead],
            ['notAsked', kpi.doubleTopsDropNotAsked],
          ]
        : [
            ['toFill', kpi.completed - kpi.sessionsWithDrop - kpi.sessionsDropNotRead],
            ['notRead', kpi.sessionsDropNotRead],
          ];
    const head =
      pattern === 'DT'
        ? t('stats.kpi.dropSub', { count: kpi.doubleTopsWithDrop }) +
          (kpi.dropsAfterTookTop > 0
            ? t('stats.kpi.dropSubTookTop', { count: kpi.dropsAfterTookTop })
            : '')
        : t('stats.kpi.gusDropSub', { count: kpi.sessionsWithDrop, total: kpi.completed });
    const counted = reasons.filter(([, count]) => count > 0);
    if (counted.length === 0) return head;
    return (
      head +
      t('stats.kpi.withoutDrop', {
        count: counted.reduce((sum, [, count]) => sum + count, 0),
        reasons: counted
          .map(([reason, count]) => t('stats.kpi.withoutDropReason.' + reason, { count }))
          .join(' · '),
      })
    );
  }
}
