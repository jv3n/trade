import { DatePipe, DecimalPipe, formatNumber } from '@angular/common';
import { Component, DestroyRef, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbChipsModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbProgressSpinnerModule,
  StbSelectModule,
  StbToast,
  StbTooltipModule,
} from '@portfolioai/ui';
import { EMPTY, catchError, filter, finalize, from, of, switchMap, tap } from 'rxjs';
import { JournalRepository } from '../../../core/api/journal/journal.repository';
import {
  PositionAggregates,
  computePositionAggregates,
} from '../../../core/api/journal/position-aggregates';
import {
  EXECUTION_KINDS,
  ExecutionKind,
  TRADE_DIRECTIONS,
  TradeDirection,
  TradeEntry,
  TradeEntryInput,
  TradeExecutionInput,
} from '../../../core/api/journal/trade-entry.model';
import { StatEntry } from '../../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../../core/api/stats/stats.repository';
import { ConfirmService } from '../../../core/app-state/confirm.service';
import { HasUnsavedChanges } from '../../../core/router/unsaved-changes.guard';
import { compressImage } from '../../../shared/image/compress-image';
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';
import { gapPercent, percentVsOpen, pmPushPercent } from '../../stats/stats.math';

/**
 * Editing buffer for one execution leg — `shares` / `price` are nullable while the user types
 * (empty input), `executedAt` is the `HH:mm` fill time of the broker statement.
 */
interface ExecRow {
  kind: ExecutionKind;
  shares: number | null;
  price: number | null;
  executedAt: string | null;
}

/**
 * What the page lets the user type : the position (direction + legs), the real P&L of the broker
 * statement and the two post-mortem fields. Everything else on a trade is inherited from its stat
 * (date, ticker, pattern) or derived from the executions.
 */
interface TradeDraft {
  direction: TradeDirection;
  executions: ExecRow[];
  realProfitDollars: number | null;
  note: string;
  errorNote: string;
}

/** The stat's premarket + session block with the percentages the sheet derives (never stored). */
export interface DayContext {
  stat: StatEntry;
  gap: number | null;
  pmPush: number | null;
  pushOpenPercent: number | null;
  hodPercent: number | null;
  lodPercent: number | null;
  eodPercent: number | null;
}

/** The three P&L figures shown side by side, plus the gap between the first two (#194). */
export interface PnlBlock {
  computed: number | null;
  real: number | null;
  gap: number | null;
  retained: number | null;
  retainedPercent: number | null;
}

function draftOf(entry: TradeEntry): TradeDraft {
  return {
    // Short-biased default — the bread-and-butter of this journal, and what a fresh trade
    // promoted from a stat carries (the backend leaves `direction` null until the first save).
    direction: entry.direction ?? 'SHORT',
    executions: entry.executions
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((e) => ({ kind: e.kind, shares: e.shares, price: e.price, executedAt: e.executedAt })),
    realProfitDollars: entry.realProfitDollars,
    note: entry.note ?? '',
    errorNote: entry.errorNote ?? '',
  };
}

/** Minutes between the first and the last timed fill — null as soon as one end has no time. */
function spanMinutes(executions: ExecRow[]): number | null {
  const minutes = executions
    .map((e) => e.executedAt)
    .filter((t): t is string => !!t)
    .map((t) => {
      const [h, m] = t.split(':');
      return Number(h) * 60 + Number(m);
    });
  if (minutes.length < 2) return null;
  return Math.max(...minutes) - Math.min(...minutes);
}

/**
 * Trade page — the full sheet of one trade (`/journal/:id`), after `mockup/trade.html` and
 * `mockup/PARCOURS.md` › step 4. A trade is born from a stat, so its identity (date, ticker,
 * pattern) is read-only here ; what is typed in is the position and the debrief :
 *
 * - **KPIs** — retained P&L ($ and %), position, average entry → exit with their distance to the
 *   session open, and the duration between the first and the last fill.
 * - **Executions** — one row per TradeZero fill (time, entry / cover, shares, price, amount), added
 *   and edited in place. The position aggregates are previewed live by the frontend mirror of the
 *   backend calculator ; the backend recomputes them on save.
 * - **P&L block** — computed (from the executions), real (typed off the broker statement) and the
 *   live gap between them (fees, rounding). Empty real ⇒ the computed one is retained, and the
 *   retained one is what reaches the account.
 * - **Day context** — the stat's premarket + session values, read-only, fetched by `statEntryId`.
 * - **Post-mortem** — « what happened » + « mistake / to improve », and the chart screenshot.
 *
 * Everything is edited **in the page** (no dialog — `MatDialog` is kept for confirmations) : the
 * draft lives in [draft], [dirty] drives the save bar, and Save sends the whole trade back. Leaving
 * with the draft unsaved asks first (`unsavedChangesGuard`, and the browser prompt on tab close).
 */
@Component({
  selector: 'app-journal-detail-page',
  host: {
    '(document:keydown.escape)': 'closeLightbox()',
    '(document:paste)': 'onPaste($event)',
    '(window:beforeunload)': 'warnBeforeUnload($event)',
  },
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    StbButtonModule,
    StbChipsModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbProgressSpinnerModule,
    StbSelectModule,
    StbTooltipModule,
    NumberMaskDirective,
    TranslatePipe,
  ],
  templateUrl: './journal-detail-page.html',
  styleUrl: './journal-detail-page.scss',
})
export class JournalDetailPage implements HasUnsavedChanges {
  private readonly repo = inject(JournalRepository);
  private readonly statsRepo = inject(StatsRepository);
  private readonly confirm = inject(ConfirmService);
  private readonly locale = inject(LOCALE_ID);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(StbToast);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  readonly entry = signal<TradeEntry | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly saving = signal(false);

  readonly directions = TRADE_DIRECTIONS;
  readonly executionKinds = EXECUTION_KINDS;

  // ---- Edit buffer ----------------------------------------------------------------------------
  // The whole page edits one draft ; the save bar shows up as soon as it drifts from the last
  // persisted state (kept in [pristine] as a JSON snapshot — the draft is a plain data tree).
  readonly draft = signal<TradeDraft | null>(null);
  private readonly pristine = signal('');
  readonly dirty = computed(() => {
    const d = this.draft();
    return d !== null && JSON.stringify(d) !== this.pristine();
  });
  /** Set once the trade is deleted : its draft has nowhere to go, leaving must not ask. */
  private deleted = false;

  hasUnsavedChanges(): boolean {
    return this.dirty() && !this.deleted;
  }

  /** Tab close / reload — the browser's own prompt, the router guard never sees these. */
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  /** Rows that carry a usable share count + price — what the calculator / the backend consume. */
  private readonly cleanExecutions = computed<TradeExecutionInput[]>(() =>
    (this.draft()?.executions ?? [])
      .filter((e) => e.shares !== null && e.shares > 0 && e.price !== null && e.price > 0)
      .map((e) => ({
        kind: e.kind,
        shares: e.shares as number,
        price: e.price as number,
        executedAt: e.executedAt,
      })),
  );

  /** Live aggregates mirroring the backend `TradePositionCalculator`. */
  readonly preview = computed<PositionAggregates>(() =>
    computePositionAggregates(this.draft()?.direction ?? null, this.cleanExecutions()),
  );

  /** True when the executions are inconsistent (e.g. covered more than shorted) — blocks save. */
  readonly executionInvalid = computed(
    () => this.cleanExecutions().length > 0 && !this.preview().valid,
  );

  /** Shares still open — what the executions table footer shows next to the computed P&L. */
  readonly remainingShares = computed(() => {
    const legs = this.cleanExecutions();
    const entered = legs.filter((l) => l.kind === 'ENTRY').reduce((a, l) => a + l.shares, 0);
    const exited = legs.filter((l) => l.kind === 'EXIT').reduce((a, l) => a + l.shares, 0);
    return entered - exited;
  });

  /**
   * The broker's P&L is read off a closed trade : on an open or partial position it would post an
   * amount no exit backs (#304). The typed value stays in the draft, and comes back once it closes.
   */
  readonly realAllowed = computed(() => this.preview().status === 'CLOSED');

  /**
   * The broker P&L already saved on a trade now reopened — Save would erase it, so the field says
   * so rather than hinting at an entry to come.
   */
  readonly realToBeErased = computed(() =>
    this.realAllowed() ? null : (this.entry()?.realProfitDollars ?? null),
  );

  /** Cost basis of the closed part — the denominator of every percentage on this page. */
  private readonly exitedNotional = computed(() => {
    const avgEntry = this.preview().avgEntry;
    const exited = this.cleanExecutions()
      .filter((l) => l.kind === 'EXIT')
      .reduce((a, l) => a + l.shares, 0);
    return avgEntry !== null && exited > 0 ? avgEntry * exited : null;
  });

  /** The three figures of the P&L block, recomputed on every keystroke. */
  readonly pnl = computed<PnlBlock>(() => {
    const computedPnl = this.preview().profitDollars;
    const real = this.realAllowed() ? (this.draft()?.realProfitDollars ?? null) : null;
    const retained = real ?? computedPnl;
    const notional = this.exitedNotional();
    return {
      computed: computedPnl,
      real,
      gap: real !== null && computedPnl !== null ? real - computedPnl : null,
      retained,
      retainedPercent: retained !== null && notional ? (retained / notional) * 100 : null,
    };
  });

  /** Trade duration, split for the « 3 h 34 » label — null while a fill has no time. */
  readonly duration = computed(() => {
    const minutes = spanMinutes(this.draft()?.executions ?? []);
    return minutes === null ? null : { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
  });

  /** First and last timed fill — the sub-line under the duration KPI. */
  readonly timeRange = computed(() => {
    const times = (this.draft()?.executions ?? [])
      .map((e) => e.executedAt)
      .filter((t): t is string => !!t)
      .sort();
    return times.length === 0 ? null : { first: times[0], last: times[times.length - 1] };
  });

  // ---- Day context (the stat the trade was born from) -----------------------------------------
  readonly context = signal<DayContext | null>(null);

  /** Average entry / exit measured against the session open — « vs open » of the mockup's KPI. */
  readonly entryVsOpen = computed(() =>
    percentVsOpen(this.context()?.stat.openPrice ?? null, this.preview().avgEntry),
  );
  readonly exitVsOpen = computed(() =>
    percentVsOpen(this.context()?.stat.openPrice ?? null, this.preview().avgExit),
  );

  // ---- Screenshot (issue #110) ----
  readonly screenshotUrl = signal<SafeUrl | null>(null);
  readonly screenshotUploading = signal(false);
  readonly dragging = signal(false);
  /** Fullscreen preview overlay (click the thumbnail to open, click / Escape to close). */
  readonly lightboxOpen = signal(false);
  /** Kept raw so we can revoke it — the signal holds the sanitized wrapper the template binds to. */
  private objectUrl: string | null = null;

  constructor() {
    // Revoke the object URL when the view is torn down — otherwise the blob leaks.
    inject(DestroyRef).onDestroy(() => this.clearObjectUrl());
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.repo.findById(this.id).subscribe({
      next: (e) => {
        this.accept(e);
        this.loading.set(false);
        if (e.hasScreenshot) this.loadScreenshot(e.id);
        this.loadContext(e.statEntryId);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Adopts a freshly persisted trade as the new baseline — the save bar goes away with it. */
  private accept(entry: TradeEntry): void {
    const draft = draftOf(entry);
    this.entry.set(entry);
    this.draft.set(draft);
    this.pristine.set(JSON.stringify(draft));
  }

  /**
   * Day context. A trade always has a stat (`statEntryId` is mandatory since #192), so a failure
   * here is a transient one : the context card stays empty rather than breaking the whole page.
   */
  private loadContext(statEntryId: string): void {
    this.statsRepo.findById(statEntryId).subscribe({
      next: (stat) =>
        this.context.set({
          stat,
          gap: gapPercent(stat.previousClose, stat.pmOpen),
          pmPush: pmPushPercent(stat.pmOpen, stat.pmHigh),
          pushOpenPercent: percentVsOpen(stat.openPrice, stat.pushOpenPrice),
          hodPercent: percentVsOpen(stat.openPrice, stat.hodPrice),
          lodPercent: percentVsOpen(stat.openPrice, stat.lodPrice),
          eodPercent: percentVsOpen(stat.openPrice, stat.eodPrice),
        }),
      error: () => this.context.set(null),
    });
  }

  // ---- Draft edition --------------------------------------------------------------------------

  private patch(change: Partial<TradeDraft>): void {
    this.draft.update((d) => (d === null ? d : { ...d, ...change }));
  }

  private patchExecution(index: number, change: Partial<ExecRow>): void {
    this.draft.update((d) =>
      d === null
        ? d
        : { ...d, executions: d.executions.map((r, i) => (i === index ? { ...r, ...change } : r)) },
    );
  }

  setDirection(direction: TradeDirection): void {
    this.patch({ direction });
  }

  setRealProfit(realProfitDollars: number | null): void {
    this.patch({ realProfitDollars });
  }

  setNote(note: string): void {
    this.patch({ note });
  }

  setErrorNote(errorNote: string): void {
    this.patch({ errorNote });
  }

  addExecution(): void {
    this.draft.update((d) =>
      d === null
        ? d
        : {
            ...d,
            // A position starts with an entry, then alternates around what is already open : the
            // next row defaults to a cover as soon as there are shares to cover.
            executions: [
              ...d.executions,
              {
                kind: this.remainingShares() > 0 ? 'EXIT' : 'ENTRY',
                shares: null,
                price: null,
                executedAt: null,
              },
            ],
          },
    );
  }

  removeExecution(index: number): void {
    this.draft.update((d) =>
      d === null ? d : { ...d, executions: d.executions.filter((_, i) => i !== index) },
    );
  }

  setExecutionKind(index: number, kind: ExecutionKind): void {
    this.patchExecution(index, { kind });
  }

  setExecutionShares(index: number, shares: number | null): void {
    this.patchExecution(index, { shares });
  }

  setExecutionPrice(index: number, price: number | null): void {
    this.patchExecution(index, { price });
  }

  setExecutionTime(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patchExecution(index, { executedAt: value || null });
  }

  /** Amount of one leg — shares × price, the column the broker statement shows. */
  amountOf(row: ExecRow): number | null {
    return row.shares !== null && row.price !== null ? row.shares * row.price : null;
  }

  // ---- Save / cancel / delete -----------------------------------------------------------------

  save(): void {
    const entry = this.entry();
    const draft = this.draft();
    if (!entry || !draft || this.executionInvalid() || this.saving()) return;

    const executions = this.cleanExecutions();
    const input: TradeEntryInput = {
      statEntryId: entry.statEntryId,
      tradeDate: entry.tradeDate,
      ticker: entry.ticker,
      pattern: entry.pattern,
      // No position yet ⇒ no direction, matching the nullable backend column.
      direction: executions.length > 0 ? draft.direction : null,
      executions,
      realProfitDollars: this.realAllowed() ? draft.realProfitDollars : null,
      note: draft.note.trim() || null,
      errorNote: draft.errorNote.trim() || null,
    };

    // The hint under the field may be off screen when Save is clicked : erasing a saved broker P&L
    // is confirmed here, where the click happens.
    const erased = this.realToBeErased();
    const proceed$ =
      erased === null
        ? of(true)
        : this.confirm.ask('journal.confirmEraseReal', {
            params: { amount: formatNumber(erased, this.locale, '1.2-2') },
            variant: 'danger',
          });
    proceed$
      .pipe(
        filter(Boolean),
        tap(() => this.saving.set(true)),
        switchMap(() => this.repo.update(entry.id, input)),
        tap((saved) => {
          this.accept(saved);
          this.toasts.success(
            this.translate.instant('journal.snackbar.updateSuccess', { ticker: saved.ticker }),
          );
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('journal.snackbar.updateError'));
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe();
  }

  cancel(): void {
    const entry = this.entry();
    if (entry) this.accept(entry);
  }

  delete(): void {
    const entry = this.entry();
    if (!entry) return;
    this.confirm
      .ask('journal.confirmDelete', { params: { ticker: entry.ticker }, variant: 'danger' })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.delete(entry.id)),
        tap(() => {
          this.deleted = true;
          this.toasts.success(
            this.translate.instant('journal.snackbar.deleteSuccess', { ticker: entry.ticker }),
          );
          void this.router.navigate(['/journal']);
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('journal.snackbar.deleteError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  // ---- Screenshot handlers ----

  openLightbox(): void {
    if (this.screenshotUrl()) this.lightboxOpen.set(true);
  }

  closeLightbox(): void {
    this.lightboxOpen.set(false);
  }

  onScreenshotFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = ''; // allow re-picking the same filename
    if (file) this.uploadScreenshot(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
  }

  onScreenshotDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file && file.type.startsWith('image/')) this.uploadScreenshot(file);
  }

  /** Paste anywhere on the page — the fastest way in from a TradingView snapshot. */
  onPaste(event: ClipboardEvent): void {
    if (this.entry()?.hasScreenshot) return;
    const file = Array.from(event.clipboardData?.items ?? [])
      .filter((i) => i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .find((f): f is File => f !== null);
    if (file) this.uploadScreenshot(file);
  }

  removeScreenshot(): void {
    const entry = this.entry();
    if (!entry) return;
    this.repo
      .deleteScreenshot(entry.id)
      .pipe(
        tap((updated) => {
          this.entry.set(updated);
          this.clearObjectUrl();
          this.toasts.success(this.translate.instant('journal.detail.screenshot.deleteSuccess'));
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('journal.detail.screenshot.deleteError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private uploadScreenshot(file: File): void {
    const entry = this.entry();
    if (!entry) return;
    this.screenshotUploading.set(true);
    // Compress client-side (downscale + WebP) before upload so the stored bytea stays small.
    from(compressImage(file))
      .pipe(
        switchMap((compressed) => this.repo.uploadScreenshot(entry.id, compressed)),
        tap((updated) => {
          this.entry.set(updated);
          this.loadScreenshot(updated.id);
          this.toasts.success(this.translate.instant('journal.detail.screenshot.uploadSuccess'));
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('journal.detail.screenshot.uploadError'));
          return EMPTY;
        }),
        finalize(() => this.screenshotUploading.set(false)),
      )
      .subscribe();
  }

  private loadScreenshot(id: string): void {
    this.repo.getScreenshotBlob(id).subscribe({
      next: (blob) => this.setObjectUrl(blob),
      error: () => this.clearObjectUrl(),
    });
  }

  private setObjectUrl(blob: Blob): void {
    this.clearObjectUrl();
    this.objectUrl = URL.createObjectURL(blob);
    this.screenshotUrl.set(this.sanitizer.bypassSecurityTrustUrl(this.objectUrl));
  }

  private clearObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.screenshotUrl.set(null);
  }
}
