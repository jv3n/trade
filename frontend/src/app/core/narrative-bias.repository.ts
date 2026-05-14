import { Observable } from 'rxjs';

/**
 * Phase 3 #3 — wire shape of the narrative bias dashboard. Mirror of the backend
 * `NarrativeBiasResponse`. Four sections, all computed server-side over the same filtered corpus
 * (date range + prompt version), so the page can render without further crunching.
 *
 * **Numeric encoding** : every `percent` field is a fraction (`0..1`, e.g. `0.681` = 68.1 %), so
 * the page can pipe through `PercentPipe`. `avgDelta1*` are also fractional changes.
 */
export interface NarrativeBias {
  /** Total snapshots that matched the active filters and entered the four aggregations. */
  snapshotsConsidered: number;
  sentimentDistribution: SentimentDistribution;
  calibration: CalibrationBucket[];
  topicCoverage: TopicCoverage;
  thumbsDistribution: ThumbsBucket[];
}

/** Counts + percent per sentiment, plus an optional bias suspicion when one bucket dominates. */
export interface SentimentDistribution {
  total: number;
  buckets: SentimentBucket[];
  /** `null` means « reasonably balanced ». Otherwise the dominant bucket and its share. */
  biasFlag: BiasFlag | null;
}

export interface SentimentBucket {
  sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  count: number;
  percent: number;
}

export interface BiasFlag {
  sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  percent: number;
  threshold: number;
}

/**
 * Calibration of one sentiment bucket vs subsequent price action — average fractional deltas at
 * 1d / 1w / 1m horizons. `null` deltas when no snapshot in the bucket has usable price-after data
 * (window not elapsed or upstream chart fetch failed). [snapshotsWithDelta*] surfaces « how
 * meaningful is this average ? » alongside the value itself.
 */
export interface CalibrationBucket {
  sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  snapshotsTotal: number;
  snapshotsWithDelta1d: number;
  snapshotsWithDelta1w: number;
  snapshotsWithDelta1m: number;
  avgDelta1d: number | null;
  avgDelta1w: number | null;
  avgDelta1m: number | null;
}

/** Top-N tokens extracted from the filtered corpus' key_points. */
export interface TopicCoverage {
  snapshotsTotal: number;
  topics: Topic[];
}

export interface Topic {
  topic: string;
  count: number;
  percent: number;
}

/** Thumbs distribution split by sentiment bucket. */
export interface ThumbsBucket {
  sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  thumbsUp: number;
  thumbsNeutral: number;
  thumbsDown: number;
  noVote: number;
}

/**
 * Filters forwarded to the backend as query params — same shape and semantics as the timeline
 * endpoint (`from inclusive, to exclusive` ; `promptId` excludes snapshots with null
 * `prompt_template_id` when set).
 */
export interface NarrativeBiasFilter {
  from?: string;
  to?: string;
  promptId?: string;
}

/** Port — read access to the bias dashboard. */
export abstract class NarrativeBiasRepository {
  abstract findBias(filter?: NarrativeBiasFilter): Observable<NarrativeBias>;
}
