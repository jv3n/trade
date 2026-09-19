import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbChipsModule,
  StbDatePickerModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbProgressSpinnerModule,
  StbSelectModule,
  StbTableModule,
  StbTooltipModule,
} from '@portfolioai/ui';
import { addDays, isBefore, isSameDay, startOfDay } from 'date-fns';
import { EMPTY, Observable, catchError, filter, finalize, switchMap, tap } from 'rxjs';
import { Candidate, CandidateInput } from '../../core/api/candidates/candidates.model';
import { CandidatesRepository } from '../../core/api/candidates/candidates.repository';
import { DEFAULT_PATTERN, PATTERNS, Pattern } from '../../core/api/shared/pattern.model';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { NumberMaskDirective } from '../../shared/number-mask/number-mask.directive';
import {
  EXPENSIVE_LOCATE_PERCENT,
  gapPercent,
  locatePercent,
  pushPercent,
} from './candidates.math';

/** The capture form — numbers are `null` until typed. Float and volume in millions. */
interface CaptureModel {
  pattern: Pattern;
  ticker: string;
  previousClose: number | null;
  pmOpen: number | null;
  pmHigh: number | null;
  floatMillions: number | null;
  volumeMillions: number | null;
  locatePerShare: number | null;
  note: string;
}

/** A listed candidate with its derived figures (never stored — recomputed from the capture). */
export interface CandidateRow extends Candidate {
  gap: number | null;
  push: number | null;
  locatePct: number | null;
}

type NumericField = Exclude<keyof CaptureModel, 'pattern' | 'ticker' | 'note'>;

function blankCapture(pattern: Pattern = DEFAULT_PATTERN): CaptureModel {
  return {
    pattern,
    ticker: '',
    previousClose: null,
    pmOpen: null,
    pmHigh: null,
    floatMillions: null,
    volumeMillions: null,
    locatePerShare: null,
    note: '',
  };
}

/**
 * Candidates page — the **morning capture** (cf. `mockup/PARCOURS.md › Étape 1` and
 * `mockup/candidat.html`) : a quick-entry form on top, the day's list below, browsed day by day.
 *
 * - **Quick entry** — Enter validates, the form resets (keeping the pattern) and the focus goes back
 *   to the ticker, so a whole radar scan is typed in one go. Gap % and push % preview live.
 * - **Edit** — a row's edit button loads it into the same form, which then saves an update.
 * - **List** — sorted by gap (largest first), with push, locate / price (amber when expensive) and
 *   the note. Delete goes through the confirmation modal.
 * - **Day navigation** — past days are read-only history : no form, no row actions.
 *
 * One candidate per (day, ticker) : the backend answers 409 on a duplicate, surfaced as a dedicated
 * toast. The derived figures come from the pure `candidates.math` helpers.
 */
@Component({
  selector: 'app-candidates-page',
  imports: [
    DatePipe,
    DecimalPipe,
    FormField,
    NumberMaskDirective,
    StbButtonModule,
    StbChipsModule,
    StbDatePickerModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbProgressSpinnerModule,
    StbSelectModule,
    StbTableModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './candidates-page.html',
  styleUrl: './candidates-page.scss',
})
export class CandidatesPage {
  private readonly repo = inject(CandidatesRepository);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  private readonly tickerInput = viewChild<ElementRef<HTMLInputElement>>('tickerInput');

  readonly patterns = PATTERNS;
  readonly expensiveLocate = EXPENSIVE_LOCATE_PERCENT;
  readonly columns = [
    'ticker',
    'pattern',
    'previousClose',
    'pmOpen',
    'pmHigh',
    'gap',
    'push',
    'float',
    'volume',
    'locate',
    'locatePct',
    'note',
    'actions',
  ] as const;

  // ---- Day ----
  readonly day = signal(startOfDay(new Date()));
  readonly isToday = computed(() => isSameDay(this.day(), new Date()));
  /** Past days are history : read-only. */
  readonly readOnly = computed(() => isBefore(this.day(), startOfDay(new Date())));

  // ---- List ----
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly candidates = signal<Candidate[]>([]);
  /** The day's candidates with their derived figures, largest gap first (no gap → last). */
  readonly rows = computed<CandidateRow[]>(() =>
    this.candidates()
      .map((c) => ({
        ...c,
        gap: gapPercent(c.previousClose, c.pmOpen),
        push: pushPercent(c.pmOpen, c.pmHigh),
        locatePct: locatePercent(c.locatePerShare, c.pmOpen),
      }))
      .sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity)),
  );

  // ---- Capture form ----
  /** Id of the candidate loaded for edit — `null` = the form captures a new one. */
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly model = signal<CaptureModel>(blankCapture());
  readonly captureForm = form(this.model, (path) => {
    required(path.ticker);
    maxLength(path.ticker, 20);
    maxLength(path.note, 2000);
  });

  readonly gapPreview = computed(() => gapPercent(this.model().previousClose, this.model().pmOpen));
  readonly pushPreview = computed(() => pushPercent(this.model().pmOpen, this.model().pmHigh));
  /** PM high typed below the PM open — flagged on the field, blocks the save. */
  readonly pmHighBelowOpen = computed(() => {
    const { pmOpen, pmHigh } = this.model();
    return pmOpen !== null && pmHigh !== null && pmHigh < pmOpen;
  });
  readonly canSave = computed(() => {
    const m = this.model();
    return (
      this.captureForm().valid() &&
      isPositive(m.previousClose) &&
      isPositive(m.pmOpen) &&
      isPositive(m.pmHigh) &&
      !this.pmHighBelowOpen()
    );
  });

  constructor() {
    this.load();
  }

  // ---- Day navigation ----

  previousDay(): void {
    this.goTo(addDays(this.day(), -1));
  }

  nextDay(): void {
    this.goTo(addDays(this.day(), 1));
  }

  today(): void {
    this.goTo(new Date());
  }

  goTo(date: Date | null): void {
    if (!date) return;
    this.day.set(startOfDay(date));
    this.resetForm();
    this.load();
  }

  // ---- Capture form ----

  setPattern(pattern: Pattern): void {
    this.model.update((m) => ({ ...m, pattern }));
  }

  setNumber(field: NumericField, value: number | null): void {
    this.model.update((m) => ({ ...m, [field]: value }));
  }

  submit(): void {
    if (!this.canSave() || this.saving()) return;
    const input = this.toInput();
    const id = this.editingId();
    const request$: Observable<Candidate> = id
      ? this.repo.update(id, input)
      : this.repo.create(input);

    this.saving.set(true);
    request$
      .pipe(
        tap((saved) => {
          this.toast(
            id ? 'candidates.snackbar.updateSuccess' : 'candidates.snackbar.createSuccess',
            'success',
            { ticker: saved.ticker },
          );
          this.resetForm();
          this.load();
        }),
        catchError((err: unknown) => {
          const duplicate = err instanceof HttpErrorResponse && err.status === 409;
          this.toast(
            duplicate ? 'candidates.snackbar.duplicate' : 'candidates.snackbar.saveError',
            'error',
            { ticker: input.ticker.trim().toUpperCase() },
          );
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe();
  }

  edit(candidate: Candidate): void {
    this.editingId.set(candidate.id);
    this.model.set({
      pattern: candidate.pattern,
      ticker: candidate.ticker,
      previousClose: candidate.previousClose,
      pmOpen: candidate.pmOpen,
      pmHigh: candidate.pmHigh,
      floatMillions: candidate.floatMillions,
      volumeMillions: candidate.volumeMillions,
      locatePerShare: candidate.locatePerShare,
      note: candidate.note ?? '',
    });
    this.focusTicker();
  }

  cancelEdit(): void {
    this.resetForm();
  }

  delete(candidate: Candidate): void {
    this.confirm
      .ask('candidates.confirmDelete', { params: { ticker: candidate.ticker }, variant: 'danger' })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.delete(candidate.id)),
        tap(() => {
          this.toast('candidates.snackbar.deleteSuccess', 'success', { ticker: candidate.ticker });
          if (this.editingId() === candidate.id) this.resetForm();
          this.load();
        }),
        catchError(() => {
          this.toast('candidates.snackbar.deleteError', 'error');
          return EMPTY;
        }),
      )
      .subscribe();
  }

  // ---- Internals ----

  private load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.repo
      .listForDate(this.day())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (list) => this.candidates.set(list),
        error: () => {
          this.candidates.set([]);
          this.loadError.set(true);
        },
      });
  }

  /** Clears the form for the next capture — keeps the pattern (a scan is usually one pattern). */
  private resetForm(): void {
    this.editingId.set(null);
    this.model.set(blankCapture(this.model().pattern));
    this.captureForm().reset();
    this.focusTicker();
  }

  private focusTicker(): void {
    this.tickerInput()?.nativeElement.focus();
  }

  private toInput(): CandidateInput {
    const m = this.model();
    return {
      tradingDate: this.day(),
      pattern: m.pattern,
      ticker: m.ticker,
      // Guarded non-null by `canSave`.
      previousClose: m.previousClose!,
      pmOpen: m.pmOpen!,
      pmHigh: m.pmHigh!,
      floatMillions: m.floatMillions,
      volumeMillions: m.volumeMillions,
      locatePerShare: m.locatePerShare,
      note: m.note,
    };
  }

  private toast(key: string, variant: 'success' | 'error', params?: Record<string, unknown>): void {
    this.snackBar.open(this.translate.instant(key, params), undefined, {
      duration: variant === 'success' ? 3000 : 5000,
      panelClass: `stb-snack-bar--${variant}`,
    });
  }
}

function isPositive(n: number | null): boolean {
  return n !== null && n > 0;
}
