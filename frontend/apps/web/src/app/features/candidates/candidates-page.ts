import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbCardModule,
  StbChipsModule,
  StbDatePickerModule,
  StbDividerModule,
  StbExpansionModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbProgressSpinnerModule,
  StbSelectModule,
} from '@portfolioai/ui';
import { EMPTY, catchError, filter, finalize, switchMap, tap } from 'rxjs';
import {
  Candidate,
  CandidateEntry,
  CandidateExit,
  CandidateInput,
} from '../../core/api/candidates/candidates.model';
import { CandidatesRepository } from '../../core/api/candidates/candidates.repository';
import { StatEntryInput } from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { NumberMaskDirective } from '../../shared/number-mask/number-mask.directive';
import { AddStatDialog, AddStatDialogData } from '../stats/add-stat-dialog/add-stat-dialog';
import {
  borrowFeePercent,
  coverSummary,
  dollarAtRisk,
  entryLadder,
  entrySummary,
  executionSummary,
  gusPercent,
} from './candidates.math';

/**
 * Form model — the Signal Forms tree's source of truth for a candidate's saved inputs. Numbers are
 * `null` until typed ; the ladders (`fills` / `entries` / `exits`) live in their own signals because
 * they're edited row-by-row, not as plain form fields. Percentages are whole numbers (`5` = 5 %, `40` = 40 %).
 */
interface CandidateFormModel {
  tradingDate: Date;
  ticker: string;
  totalCapital: number | null;
  pctCapitalAtRisk: number | null;
  openPrice: number | null;
  stopPct: number | null;
  previousClose: number | null;
  floatShares: number | null;
  volume: number | null;
  morningPush: number | null;
  borrowCostPerShare: number | null;
  note: string;
}

/**
 * Candidates cockpit — prepares a short trade for the session : risk-based entry ladder, fixed-rung
 * execution tracker (sizing only), free-form actual-entries table (the source of the average short
 * position), cover ladder, plus the GUS / borrow helpers (absorbed from the shelved calculators). All
 * arithmetic is delegated to the pure `candidates.math` functions and surfaced via `computed` signals,
 * so the tables re-derive on every keystroke with no manual wiring.
 *
 * Persistence is **upsert + dropdown** : the dropdown lists the day's candidates (date-driven —
 * older ones are hidden), selecting one fills the form, and *Save* creates (no id yet) or re-saves
 * (id held). A candidate can seed a **stats** row via *Create a stat* — opening the `add-stat-dialog`
 * pre-filled with the date, ticker, gap % (from the GUS calc) and open price.
 */
@Component({
  selector: 'app-candidates-page',
  imports: [
    DecimalPipe,
    FormField,
    TranslatePipe,
    NumberMaskDirective,
    StbButtonModule,
    StbCardModule,
    StbChipsModule,
    StbDatePickerModule,
    StbDividerModule,
    StbExpansionModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbProgressSpinnerModule,
    StbSelectModule,
  ],
  templateUrl: './candidates-page.html',
  styleUrl: './candidates-page.scss',
})
export class CandidatesPage {
  private readonly repo = inject(CandidatesRepository);
  private readonly statsRepo = inject(StatsRepository);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  /** Id of the loaded candidate — `null` = a fresh, unsaved one. Drives create-vs-update on save. */
  readonly selectedId = signal<string | null>(null);
  readonly saving = signal(false);

  readonly model = signal<CandidateFormModel>(blankModel());

  /** Shares actually short per rung (step → shares). Edited inline in the execution table. */
  readonly fills = signal<ReadonlyMap<number, number>>(new Map());
  /** Free-form short entry legs (price + shares). The source of the average short position. */
  readonly entries = signal<CandidateEntry[]>([]);
  /** Planned / executed cover legs. Edited inline in the cover table. */
  readonly exits = signal<CandidateExit[]>([]);

  /** The day's candidates feeding the dropdown (reloaded when the session date changes). */
  readonly candidatesOfDay = signal<Candidate[]>([]);

  readonly candidateForm = form(this.model, (path) => {
    required(path.ticker);
    maxLength(path.ticker, 20);
  });

  /** The numeric inputs the backend requires positive — guarded here for a clean local block. */
  readonly canSave = computed(() => {
    const m = this.model();
    return (
      this.candidateForm().valid() &&
      isPositive(m.totalCapital) &&
      isPositive(m.pctCapitalAtRisk) &&
      isPositive(m.openPrice)
    );
  });

  // ---- Derived cockpit (pure math) -------------------------------------------------------------
  readonly riskBudget = computed(() =>
    dollarAtRisk(this.model().totalCapital, this.model().pctCapitalAtRisk),
  );
  private readonly stopFraction = computed(() => {
    const s = this.model().stopPct;
    return s !== null ? s / 100 : null;
  });
  readonly ladder = computed(() =>
    entryLadder(this.model().openPrice, this.stopFraction(), this.riskBudget()),
  );
  readonly execution = computed(() =>
    executionSummary(this.ladder(), this.fills(), this.riskBudget()),
  );
  /**
   * Sizing-zone rungs for the execution table, ordered low → high (5 % first). The planned ladder
   * runs stop → profit (35 % first) ; execution is entered the way the trade builds — smallest gap
   * first — so we reverse the sizing-zone slice for display. Totals are order-independent.
   */
  readonly executionRungs = computed(() =>
    this.execution()
      .rungs.filter((r) => r.maxShares !== null)
      .reverse(),
  );
  /**
   * Free-form entry table — the trader logs actual fill price + shares. Its weighted average is the
   * **average short position** the cover ladder scores against (the fixed-rung tracker above is now
   * the sizing reference only).
   */
  readonly entryTable = computed(() =>
    entrySummary(this.entries(), this.model().openPrice, this.stopFraction()),
  );
  readonly cover = computed(() => coverSummary(this.exits(), this.entryTable().averagePosition));
  readonly gus = computed(() => gusPercent(this.model().previousClose, this.model().openPrice));
  readonly borrow = computed(() =>
    borrowFeePercent(this.model().openPrice, this.model().borrowCostPerShare),
  );

  readonly tickerLabel = computed(() => this.model().ticker.trim().toUpperCase());

  constructor() {
    this.loadDay();
  }

  /** A rung step (fraction of the open) as a whole-number percentage for display. */
  stepPercent(step: number): number {
    return step * 100;
  }

  // ---- Selection / lifecycle -------------------------------------------------------------------

  onSelect(id: string): void {
    this.repo
      .get(id)
      .pipe(catchError(() => this.fail('candidates.snackbar.loadError')))
      .subscribe((c) => this.loadCandidate(c));
  }

  newCandidate(): void {
    const tradingDate = this.model().tradingDate; // keep the session in focus
    this.model.set({ ...blankModel(), tradingDate });
    this.fills.set(new Map());
    this.entries.set([]);
    this.exits.set([]);
    this.selectedId.set(null);
  }

  // ---- Imperative setters (number-mask / datepicker push through model.update) -----------------

  setTradingDate(d: Date | null): void {
    this.model.update((m) => ({ ...m, tradingDate: d ?? new Date() }));
    this.loadDay();
  }
  setTotalCapital(n: number | null): void {
    this.model.update((m) => ({ ...m, totalCapital: n }));
  }
  setPctCapitalAtRisk(n: number | null): void {
    this.model.update((m) => ({ ...m, pctCapitalAtRisk: n }));
  }
  setOpenPrice(n: number | null): void {
    this.model.update((m) => ({ ...m, openPrice: n }));
  }
  setStopPct(n: number | null): void {
    this.model.update((m) => ({ ...m, stopPct: n }));
  }
  setPreviousClose(n: number | null): void {
    this.model.update((m) => ({ ...m, previousClose: n }));
  }
  setFloatShares(n: number | null): void {
    this.model.update((m) => ({ ...m, floatShares: n }));
  }
  setVolume(n: number | null): void {
    this.model.update((m) => ({ ...m, volume: n }));
  }
  setMorningPush(n: number | null): void {
    this.model.update((m) => ({ ...m, morningPush: n }));
  }
  setBorrowCostPerShare(n: number | null): void {
    this.model.update((m) => ({ ...m, borrowCostPerShare: n }));
  }

  // ---- Execution + cover editing ---------------------------------------------------------------

  setFill(step: number, shares: number | null): void {
    const next = new Map(this.fills());
    if (shares !== null && shares > 0) next.set(step, shares);
    else next.delete(step);
    this.fills.set(next);
  }

  addEntry(): void {
    this.entries.update((e) => [...e, { entryPrice: 0, sharesInPlay: 0 }]);
  }
  removeEntry(index: number): void {
    this.entries.update((e) => e.filter((_, i) => i !== index));
  }
  setEntryPrice(index: number, n: number | null): void {
    this.entries.update((e) => e.map((x, i) => (i === index ? { ...x, entryPrice: n ?? 0 } : x)));
  }
  setEntryShares(index: number, n: number | null): void {
    this.entries.update((e) => e.map((x, i) => (i === index ? { ...x, sharesInPlay: n ?? 0 } : x)));
  }

  addExit(): void {
    this.exits.update((e) => [...e, { exitPrice: 0, sharesCovered: 0 }]);
  }
  removeExit(index: number): void {
    this.exits.update((e) => e.filter((_, i) => i !== index));
  }
  setExitPrice(index: number, n: number | null): void {
    this.exits.update((e) => e.map((x, i) => (i === index ? { ...x, exitPrice: n ?? 0 } : x)));
  }
  setExitShares(index: number, n: number | null): void {
    this.exits.update((e) => e.map((x, i) => (i === index ? { ...x, sharesCovered: n ?? 0 } : x)));
  }

  // ---- Persistence -----------------------------------------------------------------------------

  save(): void {
    if (!this.canSave()) {
      this.candidateForm().markAsTouched();
      return;
    }
    const m = this.model();
    const input: CandidateInput = {
      tradingDate: m.tradingDate,
      ticker: m.ticker,
      totalCapital: m.totalCapital!,
      pctCapitalAtRisk: m.pctCapitalAtRisk!,
      openPrice: m.openPrice!,
      stopPct: m.stopPct,
      previousClose: m.previousClose,
      floatShares: m.floatShares,
      volume: m.volume,
      morningPush: m.morningPush,
      borrowCostPerShare: m.borrowCostPerShare,
      fills: [...this.fills()].map(([step, sharesInPlay]) => ({ step, sharesInPlay })),
      entries: this.entries(),
      exits: this.exits(),
      note: m.note || null,
    };
    // Upsert keyed on (session date, ticker) — the backend updates the matching row or creates one.
    // Changing the ticker therefore targets a *different* candidate rather than overwriting the
    // loaded one. We know it's an update only if a candidate for that date+ticker already exists.
    const isUpdate = this.candidatesOfDay().some((c) => c.ticker === m.ticker.trim().toUpperCase());
    this.saving.set(true);
    this.repo
      .create(input)
      .pipe(
        tap((saved) => {
          this.selectedId.set(saved.id);
          this.toast(
            isUpdate ? 'candidates.snackbar.updateSuccess' : 'candidates.snackbar.createSuccess',
            'success',
          );
          this.loadDay();
        }),
        catchError(() => this.fail('candidates.snackbar.saveError')),
        finalize(() => this.saving.set(false)),
      )
      .subscribe();
  }

  remove(): void {
    const id = this.selectedId();
    if (!id) return;
    this.repo
      .delete(id)
      .pipe(
        tap(() => {
          this.toast('candidates.snackbar.deleteSuccess', 'success');
          this.newCandidate();
          this.loadDay();
        }),
        catchError(() => this.fail('candidates.snackbar.deleteError')),
      )
      .subscribe();
  }

  /**
   * Create a stat from this candidate — opens the stats `AddStatDialog` pre-filled (date, ticker,
   * gap % from the GUS calc, open price) and, on submit, saves it via the stats repository. Same
   * dialog + create flow as the stats page ; the candidate is just the seed.
   */
  createStat(): void {
    const m = this.model();
    const data: AddStatDialogData = {
      entry: null,
      seed: {
        tradeDate: m.tradingDate,
        ticker: this.tickerLabel(),
        gapUpPercent: this.gus()?.percent ?? null,
        openPrice: m.openPrice,
      },
    };
    this.dialog
      .open<AddStatDialog, AddStatDialogData, StatEntryInput | undefined>(AddStatDialog, {
        data,
        width: '760px',
        maxWidth: '95vw',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .pipe(
        filter((input): input is StatEntryInput => !!input),
        switchMap((input) =>
          this.statsRepo.create(input).pipe(
            tap(() => this.toast('candidates.snackbar.statCreated', 'success')),
            catchError(() => this.fail('candidates.snackbar.statError')),
          ),
        ),
      )
      .subscribe();
  }

  // ---- Internals -------------------------------------------------------------------------------

  private loadDay(): void {
    this.repo
      .listForDate(this.model().tradingDate)
      .pipe(catchError(() => this.fail('candidates.snackbar.loadError')))
      .subscribe((rows) => this.candidatesOfDay.set(rows));
  }

  private loadCandidate(c: Candidate): void {
    this.model.set({
      tradingDate: c.tradingDate,
      ticker: c.ticker,
      totalCapital: c.totalCapital,
      pctCapitalAtRisk: c.pctCapitalAtRisk,
      openPrice: c.openPrice,
      stopPct: c.stopPct,
      previousClose: c.previousClose,
      floatShares: c.floatShares,
      volume: c.volume,
      morningPush: c.morningPush,
      borrowCostPerShare: c.borrowCostPerShare,
      note: c.note ?? '',
    });
    this.fills.set(new Map(c.fills.map((f) => [f.step, f.sharesInPlay] as [number, number])));
    this.entries.set([...c.entries]);
    this.exits.set([...c.exits]);
    this.selectedId.set(c.id);
  }

  private toast(key: string, variant: 'success' | 'error'): void {
    this.snackBar.open(this.translate.instant(key), undefined, {
      duration: variant === 'success' ? 3000 : 5000,
      panelClass: `stb-snack-bar--${variant}`,
    });
  }

  private fail(key: string) {
    this.toast(key, 'error');
    return EMPTY;
  }
}

function isPositive(n: number | null): boolean {
  return n !== null && n > 0;
}

function blankModel(): CandidateFormModel {
  return {
    tradingDate: new Date(),
    ticker: '',
    totalCapital: null,
    pctCapitalAtRisk: 5, // sensible default risk budget — the trader overrides as needed
    openPrice: null,
    stopPct: 40, // canonical stop = the top ladder rung
    previousClose: null,
    floatShares: null,
    volume: null,
    morningPush: null,
    borrowCostPerShare: null,
    note: '',
  };
}
