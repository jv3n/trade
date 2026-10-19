import { formatDate, formatNumber } from '@angular/common';
import { Component, LOCALE_ID, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbButtonToggleModule,
  StbCardModule,
  StbIconModule,
  StbProgressSpinnerModule,
  StbSkeletonCard,
  stbLoadGate,
} from '@portfolioai/ui';
import {
  RULE_SCORE_MONTHS,
  RuleScoreMonths,
  RuleScoreRow,
} from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { keptValue, lastLoadFailed } from '../../shared/kept-value/kept-value';

/** Where the window last chosen is kept — a per-browser habit, like the report's chips. */
const MONTHS_KEY = 'reports.rules.months';
/**
 * Three months by default : at about eleven triggered trades a month, two would sit on the threshold
 * and the figure would come and go (#727) — the short windows stay a deliberate choice.
 */
const DEFAULT_MONTHS: RuleScoreMonths = 3;

/** Below this many triggered trades a rule shows its n, not a rate : a handful says nothing. */
export const MIN_TRIGGERED = 20;

/**
 * « Rapports », tab « Règles GUS » (#205) : the mechanical rules 10 / 40 and 7 / 31 replayed on the
 * completed GUS of a rolling window — the rule, not my trades. The window is the card's own toggle,
 * up to today, never the stats page's period filter : an edge is not stationary (#727).
 */
@Component({
  selector: 'app-rule-score-report',
  imports: [
    StbButtonModule,
    StbButtonToggleModule,
    StbCardModule,
    StbIconModule,
    StbProgressSpinnerModule,
    StbSkeletonCard,
    TranslatePipe,
  ],
  templateUrl: './rule-score-report.html',
  styleUrl: './rule-score-report.scss',
})
export class RuleScoreReport {
  private readonly repo = inject(StatsRepository);
  private readonly locale = inject(LOCALE_ID);

  readonly windows = RULE_SCORE_MONTHS;
  readonly minTriggered = MIN_TRIGGERED;
  readonly months = signal<RuleScoreMonths>(readStoredMonths());
  /** Bumped by « Réessayer » : a new key, where `reload()` is a no-op while a load runs. */
  private readonly retries = signal(0);

  private readonly scoreResource = rxResource({
    params: () => ({ months: this.months(), retry: this.retries() }),
    stream: ({ params }) => this.repo.ruleScore(params.months),
  });
  readonly score = keptValue(this.scoreResource);
  readonly failed = lastLoadFailed(this.scoreResource);
  readonly loading = this.scoreResource.isLoading;
  readonly gate = stbLoadGate(this.loading);

  setMonths(months: RuleScoreMonths): void {
    this.months.set(months);
    try {
      localStorage.setItem(MONTHS_KEY, String(months));
    } catch {
      // Blocked storage : the choice lasts the page.
    }
  }

  retry(): void {
    this.retries.update((n) => n + 1);
  }

  readable(row: RuleScoreRow): boolean {
    return row.triggered >= MIN_TRIGGERED;
  }

  hitRate(row: RuleScoreRow): string {
    return this.percent((row.wins / row.triggered) * 100);
  }

  /** Signed, one decimal, the interface's locale ; « — » without a figure. */
  signed(value: number | null): string {
    if (value === null) return '—';
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${this.percent(Math.abs(value))}`;
  }

  ratio(value: number | null): string {
    return value === null ? '—' : formatNumber(value, this.locale, '1.2-2');
  }

  day(date: Date): string {
    return formatDate(date, 'dd/MM', this.locale);
  }

  private percent(value: number): string {
    return `${formatNumber(value, this.locale, '1.1-1')} %`;
  }
}

/** The window last chosen, when it is still offered ; three months otherwise. */
function readStoredMonths(): RuleScoreMonths {
  try {
    const stored = Number(localStorage.getItem(MONTHS_KEY));
    return RULE_SCORE_MONTHS.find((m) => m === stored) ?? DEFAULT_MONTHS;
  } catch {
    return DEFAULT_MONTHS;
  }
}
