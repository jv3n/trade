import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbDatePickerModule,
  StbDialogModule,
  StbDividerModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbProgressSpinnerModule,
  StbSelectModule,
} from '@portfolioai/ui';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import {
  computePositionAggregates,
  PositionAggregates,
} from '../../../core/api/journal/position-aggregates';
import {
  ExecutionKind,
  TRADE_DIRECTIONS,
  TradeDirection,
  TradeEntry,
  TradeEntryInput,
  TradeExecutionInput,
} from '../../../core/api/journal/trade-entry.model';
import { DEFAULT_PATTERN, Pattern, PATTERNS } from '../../../core/api/shared/pattern.model';
import { StatEntry } from '../../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../../core/api/stats/stats.repository';
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';

/**
 * Editing buffer for one execution row — `shares` / `price` are nullable while the user types
 * (empty input). Cleaned to a [TradeExecutionInput] on submit (rows with shares > 0 && price > 0).
 */
interface ExecRow {
  kind: ExecutionKind;
  shares: number | null;
  price: number | null;
  /** Fill time (`HH:mm`) when the broker statement gives one. No input yet — carried on edit. */
  executedAt: string | null;
}

/**
 * Seed for create mode — pre-fills a brand-new trade (e.g. opened from a stat row). Ignored
 * when `entry` is set (edit mode reads from the entry).
 */
export interface AddTradeSeed {
  ticker: string;
  tradeDate: Date;
  statEntryId: string | null;
}

/** Data passed to the dialog — `entry` non-null = edit mode, null = create mode. */
export interface AddTradeDialogData {
  entry: TradeEntry | null;
  /** Optional pre-fill for create mode (ticker / date / stat link). */
  seed?: AddTradeSeed;
}

/**
 * Form model — the Signal Forms tree's source of truth. Strings are non-nullable (empty `""`
 * by default) so the `[formField]` directive on `<input>` / `<textarea>` has a consistent
 * type ; the form output [TradeEntryInput] sends `null` for blank strings.
 */
interface TradeFormModel {
  tradeDate: Date;
  ticker: string;
  direction: TradeDirection;
  pattern: Pattern;
  note: string;
  errorNote: string;
}

/**
 * Dialog form for creating / editing a trade entry — built on **Signal Forms**
 * (Angular 22's signal-native forms API at `@angular/forms/signals`). The model lives in a
 * `WritableSignal<TradeFormModel>` ; the `form()` call wraps it into a `FieldTree` that
 * inputs bind to via the `[formField]` directive — no `formControlName`, no `[formGroup]`,
 * no HTML validation attrs (Signal Forms forbids them on `[formField]` elements ; the schema
 * is the single source of truth).
 *
 * Since the multi-execution model (issue #93) the execution data is a **direction** + a dynamic list
 * of **executions** (entry/exit legs, each with shares + price). These live outside the Signal Forms
 * tree (in the [executions] signal) because they're a variable-length array. The flat aggregates
 * (avg price, P&L, gain%) are **not** entered — a live [preview] mirrors the backend calculator for
 * instant feedback, and the backend recomputes them on persist. Only `tradeDate` + `ticker` are
 * required ; a trade can be jotted down with no executions yet. Returns the **domain**
 * [TradeEntryInput] on close — the HTTP adapter handles the wire serialisation. The stat link
 * (`statEntryId`) is **mandatory** since #192 — a trade is born from a stat — so submit is blocked
 * until the combobox holds one.
 */
@Component({
  selector: 'app-add-trade-dialog',

  imports: [
    DecimalPipe,
    FormField,
    StbButtonModule,
    StbDialogModule,
    StbDividerModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbProgressSpinnerModule,
    StbSelectModule,
    NumberMaskDirective,
    StbDatePickerModule,
    TranslatePipe,
  ],
  templateUrl: './add-trade-dialog.html',
  styleUrl: './add-trade-dialog.scss',
})
export class AddTradeDialog {
  private readonly dialogRef =
    inject<MatDialogRef<AddTradeDialog, TradeEntryInput | undefined>>(MatDialogRef);
  private readonly data = inject<AddTradeDialogData>(MAT_DIALOG_DATA);
  private readonly statsRepo = inject(StatsRepository);

  readonly isEdit = computed(() => this.data.entry !== null);
  readonly submitting = signal(false);

  readonly patterns = PATTERNS;
  readonly directions = TRADE_DIRECTIONS;

  readonly model = signal<TradeFormModel>(this.initialModel());

  // Signal Forms tree. Validators are declared via a schema callback that receives the path
  // for each field — typed and refactor-safe.
  readonly tradeForm = form(this.model, (path) => {
    required(path.tradeDate);
    required(path.ticker);
    maxLength(path.ticker, 20);
  });

  // ---- Executions — a variable-length array kept outside the Signal Forms tree -----------------
  readonly executions = signal<ExecRow[]>(this.initialExecutions());

  /** Rows that carry a usable share count + price — the input the calculator / backend consume. */
  private readonly cleanExecutions = computed<TradeExecutionInput[]>(() =>
    this.executions()
      .filter((e) => e.shares !== null && e.shares > 0 && e.price !== null && e.price > 0)
      .map((e) => ({
        kind: e.kind,
        shares: e.shares as number,
        price: e.price as number,
        executedAt: e.executedAt,
      })),
  );

  /** Live aggregates mirroring the backend `TradePositionCalculator` — for instant preview. */
  readonly preview = computed<PositionAggregates>(() =>
    computePositionAggregates(this.model().direction, this.cleanExecutions()),
  );

  /** True when the executions are inconsistent (e.g. exited > entered) — blocks submit. */
  readonly executionInvalid = computed(
    () => this.cleanExecutions().length > 0 && !this.preview().valid,
  );

  addExecution(kind: ExecutionKind): void {
    this.executions.update((rows) => [
      ...rows,
      { kind, shares: null, price: null, executedAt: null },
    ]);
  }

  removeExecution(index: number): void {
    this.executions.update((rows) => rows.filter((_, i) => i !== index));
  }

  setExecutionKind(index: number, kind: ExecutionKind): void {
    this.executions.update((rows) => rows.map((r, i) => (i === index ? { ...r, kind } : r)));
  }

  setExecutionShares(index: number, shares: number | null): void {
    this.executions.update((rows) => rows.map((r, i) => (i === index ? { ...r, shares } : r)));
  }

  setExecutionPrice(index: number, price: number | null): void {
    this.executions.update((rows) => rows.map((r, i) => (i === index ? { ...r, price } : r)));
  }

  setDirection(direction: TradeDirection): void {
    this.model.update((m) => ({ ...m, direction }));
  }

  // ---- Stat link (mandatory since #192) -------------------------------------------------------
  // Not a form field — it is a relation assigned via a combobox, carried as its own signal and
  // emitted on submit. Defaults to the trade existing link, or to the seed when the dialog was
  // opened from a stat row. Null blocks the submit : a trade without its stat has no context.
  readonly statEntryId = signal<string | null>(
    this.data.entry?.statEntryId ?? this.data.seed?.statEntryId ?? null,
  );

  // The combobox proposes only the strict candidates : same ticker AND same date as the trade.
  // Multiple can coexist (the global IMPORT row + the user's own MANUAL/RADAR row for that day).
  private readonly statQuery = computed(() => {
    const m = this.model();
    return {
      ticker: m.ticker.trim().toUpperCase(),
      date: m.tradeDate,
      dateMs: m.tradeDate.getTime(),
    };
  });

  readonly statCandidates = toSignal(
    toObservable(this.statQuery).pipe(
      debounceTime(200),
      distinctUntilChanged((a, b) => a.ticker === b.ticker && a.dateMs === b.dateMs),
      switchMap((q) => {
        if (!q.ticker) return of<StatEntry[]>([]);
        return this.statsRepo
          .findAll(
            { query: q.ticker, dateFrom: q.date, dateTo: q.date },
            { pageIndex: 0, pageSize: 50 },
          )
          .pipe(
            // The backend `query` is a substring match — keep only the exact ticker.
            map((res) => res.content.filter((s) => s.ticker.toUpperCase() === q.ticker)),
            catchError(() => of<StatEntry[]>([])),
          );
      }),
    ),
    { initialValue: [] as StatEntry[] },
  );

  setStatEntryId(id: string | null): void {
    this.statEntryId.set(id);
  }

  submit(): void {
    const statEntryId = this.statEntryId();
    if (!this.tradeForm().valid() || this.executionInvalid() || statEntryId === null) {
      this.tradeForm().markAsTouched();
      return;
    }
    const v = this.model();
    const executions = this.cleanExecutions();
    const input: TradeEntryInput = {
      statEntryId,
      tradeDate: v.tradeDate,
      ticker: v.ticker,
      pattern: v.pattern,
      // Only attach a direction when there's actually a position — a blank jotted trade stays
      // direction-less (matches the backend nullable column).
      direction: executions.length > 0 ? v.direction : null,
      executions,
      // The real P&L is typed on the trade page, not here — carried through untouched on edit.
      realProfitDollars: this.data.entry?.realProfitDollars ?? null,
      note: v.note || null,
      errorNote: v.errorNote || null,
    };
    this.dialogRef.close(input);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  // ---- Imperative setter — wired to `(dateChange)` because Signal Forms' `[formField]` clashes
  //      with Material's CVA-based `MatDatepickerInput`. We push the value through
  //      `model.update(...)` so Signal Forms still picks up the change for validation. ----------

  setTradeDate(d: Date | null): void {
    // Material's datepicker emits `null` when the field is cleared — coerce to "today"
    // since a trade journal entry without a date is meaningless.
    this.model.update((m) => ({ ...m, tradeDate: d ?? new Date() }));
  }

  private initialModel(): TradeFormModel {
    const entry = this.data.entry;
    if (!entry) {
      const seed = this.data.seed;
      return {
        tradeDate: seed?.tradeDate ?? new Date(),
        ticker: seed?.ticker ?? '',
        // Short-biased default — the bread-and-butter of this journal.
        direction: 'SHORT',
        pattern: DEFAULT_PATTERN,
        note: '',
        errorNote: '',
      };
    }
    return {
      tradeDate: entry.tradeDate,
      ticker: entry.ticker,
      direction: entry.direction ?? 'SHORT',
      pattern: entry.pattern,
      note: entry.note ?? '',
      errorNote: entry.errorNote ?? '',
    };
  }

  /** Edit mode preloads the existing legs ; create mode starts with a single empty ENTRY row. */
  private initialExecutions(): ExecRow[] {
    const entry = this.data.entry;
    if (!entry || entry.executions.length === 0) {
      return [{ kind: 'ENTRY', shares: null, price: null, executedAt: null }];
    }
    return entry.executions
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((e) => ({
        kind: e.kind,
        shares: e.shares,
        price: e.price,
        executedAt: e.executedAt,
      }));
  }
}
