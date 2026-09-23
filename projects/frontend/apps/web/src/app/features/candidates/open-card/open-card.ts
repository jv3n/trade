import { DecimalPipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbButtonToggleModule,
  StbChipsModule,
  StbIconModule,
  StbTableModule,
  StbTooltipModule,
} from '@portfolioai/ui';
import { Candidate } from '../../../core/api/candidates/candidates.model';
import { Pattern } from '../../../core/api/shared/pattern.model';
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';
import { percentChange } from '../../../shared/percent/percent';
import { PricePipe } from '../../../shared/price/price.pipe';
import {
  MAX_TARGET_PUSH_PERCENT,
  UNUSUAL_TARGET_PUSH_PERCENT,
  targetPrice,
} from '../candidates.math';

/** The push at the open of the completed stats of one pattern — what a row can aim at. */
export interface PushReferences {
  median: number | null;
  average: number | null;
  thirdQuartile: number | null;
  max: number | null;
}

/**
 * How many of the same completed stats never pushed (#302) — the references leave them out, so the
 * card states it : a target built on the average assumes a push is coming (#332).
 */
export interface NoPushRate {
  noPush: number;
  completed: number;
}

export type ReferenceKind = keyof PushReferences;

export const REFERENCE_KINDS: readonly ReferenceKind[] = [
  'median',
  'average',
  'thirdQuartile',
  'max',
];

/** What a row changed, for the page to save — a `null` target push goes back to the reference. */
export interface AtOpenChange {
  candidate: Candidate;
  patch: Partial<Pick<Candidate, 'openPrice' | 'targetPushPercent'>>;
}

interface OpenRow {
  candidate: Candidate;
  /** Push of the selected reference for the candidate's pattern — null without a completed stat. */
  reference: number | null;
  /** Push aimed at : the candidate's own, else the reference. */
  push: number | null;
  /** True when the candidate has its own target push rather than following the reference. */
  custom: boolean;
  /** Past 100 % : possible, but worth a second look before aiming at it. */
  unusualPush: boolean;
  highVsOpen: number | null;
  target: number | null;
  delta: number | null;
}

/**
 * The « À l'open » card (cf. `mockup/PARCOURS.md › At the open` and `mockup/candidat.html`) : at
 * 9:30 the open of each candidate, the push aimed at and the target price it gives.
 *
 * - **The open** and **the target push** are typed here and handed to the page on blur
 *   ([atOpenChange]), which saves them on the candidate.
 * - **The target push** starts from the selected reference (median, average, 3rd quartile, max of
 *   the pattern's completed stats) and can be typed per row, because how far a push runs depends on
 *   the stock. Switching the reference only moves the rows without a push of their own ; the
 *   selected reference itself is a display setting, not stored.
 */
@Component({
  selector: 'app-open-card',
  imports: [
    DecimalPipe,
    PricePipe,
    NumberMaskDirective,
    StbButtonModule,
    StbButtonToggleModule,
    StbChipsModule,
    StbIconModule,
    StbTableModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './open-card.html',
  styleUrl: './open-card.scss',
})
export class OpenCard {
  /** The day's candidates, in the order of the page's list. */
  readonly candidates = input.required<Candidate[]>();
  /** References per pattern — a pattern missing here is still loading or has no completed stat. */
  readonly references = input.required<Partial<Record<Pattern, PushReferences>>>();
  /** No-push rate per pattern, over the same completed stats as [references]. */
  readonly noPushRates = input<Partial<Record<Pattern, NoPushRate>>>({});
  /** Past days are history : the open and the push are shown, not typed. */
  readonly readOnly = input(false);

  readonly atOpenChange = output<AtOpenChange>();

  readonly kinds = REFERENCE_KINDS;
  readonly maxTargetPush = MAX_TARGET_PUSH_PERCENT;
  readonly unusualPush = UNUSUAL_TARGET_PUSH_PERCENT;
  readonly columns = ['ticker', 'pmHigh', 'open', 'highVsOpen', 'push', 'target', 'delta'] as const;

  readonly kind = signal<ReferenceKind>('average');

  /**
   * The references shown on the toggles — only when the whole day shares one pattern (the usual GUS
   * morning) ; a mixed day shows the labels alone and each row applies its own pattern's figure.
   */
  readonly dayReferences = computed<PushReferences | null>(() => {
    const patterns = new Set(this.candidates().map((c) => c.pattern));
    if (patterns.size !== 1) return null;
    const [pattern] = patterns;
    return this.references()[pattern] ?? null;
  });

  /** The figure a toggle shows — null on a mixed day or without a completed stat. */
  dayReference(kind: ReferenceKind): number | null {
    return this.dayReferences()?.[kind] ?? null;
  }

  /**
   * The no-push rate beside the toggles — like their figures, only on a one-pattern day ; hidden
   * when no day went without a push, as under the stats page's KPI.
   */
  readonly dayNoPushRate = computed(() => {
    const patterns = new Set(this.candidates().map((c) => c.pattern));
    if (patterns.size !== 1) return null;
    const [pattern] = patterns;
    const rate = this.noPushRates()[pattern];
    if (!rate || rate.noPush === 0) return null;
    return { ...rate, percent: (rate.noPush / rate.completed) * 100 };
  });

  /** No reference at all for the day's patterns — no completed stat yet. */
  readonly noReference = computed(() =>
    this.candidates().every((c) => (this.references()[c.pattern]?.[this.kind()] ?? null) === null),
  );

  readonly rows = computed<OpenRow[]>(() => {
    const kind = this.kind();
    return this.candidates().map((candidate) => {
      // The number on screen is the number used (#311) : the push is shown at one decimal, so the
      // target price is computed from that one — `3.9 × 15.3 %` has to reproduce what is displayed.
      const reference = roundToOneDecimal(this.references()[candidate.pattern]?.[kind] ?? null);
      const own = roundToOneDecimal(candidate.targetPushPercent);
      // A push of its own that equals the reference has nothing to go back to (#320).
      const custom = own !== null && own !== reference;
      const push = custom ? own : reference;
      const target = targetPrice(candidate.openPrice, push);
      return {
        candidate,
        reference,
        push,
        custom,
        unusualPush: push !== null && push > UNUSUAL_TARGET_PUSH_PERCENT,
        highVsOpen: percentChange(candidate.openPrice, candidate.pmHigh),
        target,
        delta:
          target !== null && candidate.openPrice !== null ? target - candidate.openPrice : null,
      };
    });
  });

  /** Values being typed, keyed by candidate id — committed on blur. */
  private readonly openDrafts = new Map<string, number | null>();
  private readonly pushDrafts = new Map<string, number | null>();

  selectKind(kind: ReferenceKind): void {
    this.kind.set(kind);
  }

  draftOpen(candidate: Candidate, value: number | null): void {
    this.openDrafts.set(candidate.id, value);
  }

  commitOpen(candidate: Candidate): void {
    if (!this.openDrafts.has(candidate.id)) return;
    const openPrice = this.openDrafts.get(candidate.id) ?? null;
    this.openDrafts.delete(candidate.id);
    if (openPrice !== candidate.openPrice)
      this.atOpenChange.emit({ candidate, patch: { openPrice } });
  }

  draftPush(row: OpenRow, value: number | null): void {
    this.pushDrafts.set(
      row.candidate.id,
      value === null ? null : Math.min(value, MAX_TARGET_PUSH_PERCENT),
    );
  }

  /** A cleared push, or one typed back to the reference, follows the reference again. */
  commitPush(row: OpenRow): void {
    const id = row.candidate.id;
    if (!this.pushDrafts.has(id)) return;
    const value = this.pushDrafts.get(id) ?? null;
    this.pushDrafts.delete(id);
    const targetPushPercent = value === null || value === row.reference ? null : value;
    if (targetPushPercent !== row.candidate.targetPushPercent) {
      this.atOpenChange.emit({ candidate: row.candidate, patch: { targetPushPercent } });
    }
  }

  resetPush(row: OpenRow): void {
    this.atOpenChange.emit({ candidate: row.candidate, patch: { targetPushPercent: null } });
  }
}

/** One decimal — the precision the push is both shown at and computed from (#311). */
function roundToOneDecimal(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}
