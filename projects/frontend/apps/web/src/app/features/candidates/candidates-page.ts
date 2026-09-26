import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  LOCALE_ID,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbChipsModule,
  StbDatePickerModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbProgressSpinnerModule,
  StbTableModule,
  StbToast,
  StbTooltipModule,
} from '@portfolioai/ui';
import { addDays, isBefore, isSameDay, isWeekend, startOfDay } from 'date-fns';
import {
  EMPTY,
  Observable,
  Subscription,
  catchError,
  filter,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';
import {
  Candidate,
  CandidateInput,
  PROMOTION_PATTERNS,
} from '../../core/api/candidates/candidates.model';
import { CandidatesRepository } from '../../core/api/candidates/candidates.repository';
import { Pattern } from '../../core/api/shared/pattern.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { NumberMaskDirective } from '../../shared/number-mask/number-mask.directive';
import { PluralPipe, pluralKey } from '../../shared/plural/plural';
import { PricePipe } from '../../shared/price/price.pipe';
import {
  EXPENSIVE_LOCATE_PERCENT,
  gapPercent,
  locatePercent,
  pushPercent,
} from './candidates.math';
import { AtOpenChange, NoPushRate, OpenCard, PushReferences } from './open-card/open-card';

/** The capture form — numbers are `null` until typed. Float and volume in millions. */
interface CaptureModel {
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
  /** The patterns it can still be promoted to — one button each, gone once its stat exists. */
  promotableTo: Pattern[];
}

type NumericField = Exclude<keyof CaptureModel, 'ticker' | 'note'>;

function blankCapture(): CaptureModel {
  return {
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
 * - **Quick entry** — Enter validates, the form resets and the focus goes back to the ticker, so a
 *   whole radar scan is typed in one go. Gap % and push % preview live. No pattern : it is chosen
 *   when promoting.
 * - **Edit** — a row's edit button loads it into the same form, which then saves an update.
 * - **List** — sorted by gap (largest first), with push, locate / price (amber when expensive) and
 *   the note. Delete goes through the confirmation modal.
 * - **At the open** — the « À l'open » card ([OpenCard]) : the open and the target push typed at
 *   9:30 are saved on blur (an edit : no modal) ; the push references come from the GUS stats, and
 *   a candidate whose only stat is a DT is left out — the push aimed at is a GUS notion.
 * - **Promotion** — « → GUS » and « → DT » per row, one stat per pattern ; « Tout passer en GUS »
 *   promotes the candidates without any stat, never to DT.
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
    PricePipe,
    FormField,
    NumberMaskDirective,
    OpenCard,
    RouterLink,
    StbButtonModule,
    StbChipsModule,
    StbDatePickerModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbProgressSpinnerModule,
    StbTableModule,
    StbTooltipModule,
    PluralPipe,
    TranslatePipe,
  ],
  templateUrl: './candidates-page.html',
  styleUrl: './candidates-page.scss',
})
export class CandidatesPage {
  private readonly repo = inject(CandidatesRepository);
  private readonly stats = inject(StatsRepository);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(StbToast);
  private readonly translate = inject(TranslateService);
  private readonly locale = inject(LOCALE_ID);

  private readonly tickerInput = viewChild<ElementRef<HTMLInputElement>>('tickerInput');
  private readonly document = inject(DOCUMENT);

  readonly expensiveLocate = EXPENSIVE_LOCATE_PERCENT;
  readonly columns = [
    'ticker',
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
  /** No session on a weekend : an empty list is expected, not a day without candidates. */
  readonly weekend = computed(() => isWeekend(this.day()));

  // ---- List ----
  readonly loading = signal(true);
  readonly loadError = signal(false);
  // A superseded day is dropped, or a slow answer for yesterday lands on today's page (#370).
  private listing?: Subscription;
  readonly candidates = signal<Candidate[]>([]);
  /**
   * Push at the open of the completed GUS stats — the references of the « À l'open » card. Fetched
   * once : they only move when a stat is completed.
   */
  readonly pushReferences = signal<PushReferences | null>(null);
  readonly noPushRate = signal<NoPushRate | null>(null);
  private readonly gusSummary$ = this.stats.summary({ pattern: 'GUS' }).pipe(
    map((summary): GusSummary => ({
      references: {
        median: summary.medianPushOpenPercent,
        average: summary.averagePushOpenPercent,
        thirdQuartile: summary.thirdQuartilePushOpenPercent,
        max: summary.maxPushOpenPercent,
      },
      rate: { noPush: summary.noPushCount, completed: summary.completed },
    })),
    // No summary = no reference, so no target price ; the candidates themselves still show.
    catchError(() => of<GusSummary>({ references: NO_REFERENCES, rate: null })),
    shareReplay(1),
  );
  /** The day's candidates with their derived figures, largest gap first (no gap → last). */
  readonly rows = computed<CandidateRow[]>(() =>
    this.candidates()
      .map((c) => ({
        ...c,
        gap: gapPercent(c.previousClose, c.pmOpen),
        push: pushPercent(c.pmOpen, c.pmHigh),
        locatePct: locatePercent(c.locatePerShare, c.pmOpen),
        promotableTo: PROMOTION_PATTERNS.filter((p) => !c.stats.some((s) => s.pattern === p)),
      }))
      .sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity)),
  );
  /** The « À l'open » rows : a candidate whose only stat is a DT has no push to aim at. */
  readonly openRows = computed(() =>
    this.rows().filter((c) => c.stats.length === 0 || c.stats.some((s) => s.pattern === 'GUS')),
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
  /**
   * The ticker is already in the day (#315) — said while typing rather than by a 409 toast on
   * submit. The candidate being edited doesn't count as its own duplicate.
   */
  readonly duplicateTicker = computed(() => {
    const ticker = this.model().ticker.trim().toUpperCase();
    if (!ticker) return false;
    const editing = this.editingId();
    return this.rows().some((c) => c.ticker === ticker && c.id !== editing);
  });

  readonly canSave = computed(() => {
    const m = this.model();
    return (
      !this.duplicateTicker() &&
      this.captureForm().valid() &&
      isPositive(m.previousClose) &&
      isPositive(m.pmOpen) &&
      isPositive(m.pmHigh) &&
      !this.pmHighBelowOpen()
    );
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.listing?.unsubscribe());
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
          this.toasts.success(
            this.translate.instant(
              id ? 'candidates.snackbar.updateSuccess' : 'candidates.snackbar.createSuccess',
              { ticker: saved.ticker },
            ),
          );
          this.resetForm();
          this.load();
        }),
        catchError((err: unknown) => {
          const duplicate = err instanceof HttpErrorResponse && err.status === 409;
          this.toasts.error(
            this.translate.instant(
              duplicate ? 'candidates.snackbar.duplicate' : 'candidates.snackbar.saveError',
              { ticker: input.ticker.trim().toUpperCase() },
            ),
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

  // ---- At the open (#261) ----

  /**
   * Saves what a row of the « À l'open » card changed — an edit, so no modal and no toast unless it
   * fails. The row is patched **before** the call : the open and the push of a row are often typed
   * back to back, and the second save must start from the first one, not from the server's reply.
   * A reload is avoided too — it would steal the focus from the next field.
   */
  saveAtOpen({ candidate, patch }: AtOpenChange): void {
    const current = this.candidates().find((c) => c.id === candidate.id);
    if (!current) return;
    const patched = { ...current, ...patch };
    this.replaceCandidate(patched);

    this.repo
      .update(candidate.id, toCandidateInput(patched))
      .pipe(
        catchError(() => {
          this.replaceCandidate(current);
          this.toasts.error(
            this.translate.instant('candidates.snackbar.atOpenSaveError', {
              ticker: candidate.ticker,
            }),
          );
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private replaceCandidate(candidate: Candidate): void {
    this.candidates.update((list) => list.map((c) => (c.id === candidate.id ? candidate : c)));
  }

  // ---- Promotion to the stats sheet (#189) ----

  /** Candidates of the day without any stat — what « Tout passer en GUS » would act on. */
  readonly promotable = computed(() => this.rows().filter((c) => c.stats.length === 0));

  /**
   * « → GUS » / « → DT » on a row : copies the candidate onto the sheet in that pattern, where it
   * starts "to complete". A candidate gets one stat per pattern.
   */
  promote(candidate: Candidate, pattern: Pattern): void {
    this.confirm
      .ask(`candidates.confirmPromote.${pattern}`, { params: { ticker: candidate.ticker } })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.promote(candidate.id, pattern)),
        tap(() => {
          this.toasts.success(
            this.translate.instant('candidates.snackbar.promoteSuccess', {
              ticker: candidate.ticker,
              pattern,
            }),
          );
          this.load();
        }),
        catchError(() => {
          this.toasts.error(
            this.translate.instant('candidates.snackbar.promoteError', {
              ticker: candidate.ticker,
            }),
          );
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /**
   * « Tout passer en GUS » : promotes to GUS every candidate of the day without any stat — never
   * to DT. The modal names them, and the backend stays idempotent : anything already there comes
   * back in `skipped` rather than failing the batch, and the toast names it.
   */
  promoteAll(): void {
    const pending = this.promotable();
    if (pending.length === 0) return;
    this.confirm
      .ask(pluralKey('candidates.confirmPromoteAll', pending.length, this.locale), {
        params: {
          count: pending.length,
          tickers: pending.map((c) => c.ticker).join(', '),
        },
      })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.promoteDay(this.day())),
        tap((result) => {
          const promoted = this.translate.instant(
            pluralKey('candidates.snackbar.promoteAllSuccess', result.promoted.length, this.locale),
            { count: result.promoted.length },
          );
          const skipped = result.skipped.length
            ? ' ' +
              this.translate.instant(
                pluralKey(
                  'candidates.snackbar.promoteAllSkipped',
                  result.skipped.length,
                  this.locale,
                ),
                { tickers: result.skipped.join(', ') },
              )
            : '';
          this.toasts.success(promoted + skipped);
          this.load();
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('candidates.snackbar.promoteAllError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  delete(candidate: Candidate): void {
    this.confirm
      .ask('candidates.confirmDelete', { params: { ticker: candidate.ticker }, variant: 'danger' })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.delete(candidate.id)),
        tap(() => {
          this.toasts.success(
            this.translate.instant('candidates.snackbar.deleteSuccess', {
              ticker: candidate.ticker,
            }),
          );
          if (this.editingId() === candidate.id) this.resetForm();
          this.load();
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('candidates.snackbar.deleteError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  // ---- Internals ----

  private load(): void {
    // Before `loading.set(true)` : the dropped request's `finalize` resets the flag.
    this.listing?.unsubscribe();
    this.loading.set(true);
    this.loadError.set(false);
    this.listing = this.repo
      .listForDate(this.day())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (list) => {
          this.candidates.set(list);
          this.loadPushReferences();
        },
        error: () => {
          this.candidates.set([]);
          this.loadError.set(true);
        },
      });
  }

  /** Reads the GUS references — the request is shared, so it only goes out once. */
  private loadPushReferences(): void {
    if (this.pushReferences()) return;
    this.gusSummary$.subscribe(({ references, rate }) => {
      this.pushReferences.set(references);
      this.noPushRate.set(rate);
    });
  }

  /**
   * Clears the form for the next capture.
   *
   * **Blurs first** (#315) : giving the focus back to the ticker fires `blur` on the field being
   * typed, and the number mask answers a blur by pushing the text it still shows back into the
   * model — the value we just cleared would come back, and ride into the next candidate. Leaving
   * the field before the model is cleared makes that write land on the value it came from.
   *
   * This leans on blur / focus ordering and on what Signal Forms' `reset()` touches, both young
   * enough to move : re-read it on the next Angular migration. The spec around it is what catches
   * the day it does.
   */
  private resetForm(): void {
    this.blurActiveField();
    this.editingId.set(null);
    this.model.set(blankCapture());
    this.captureForm().reset();
    this.focusTicker();
  }

  /** Leaves whichever capture field holds the focus, so its own blur runs before anything else. */
  private blurActiveField(): void {
    const active = this.document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }

  private focusTicker(): void {
    this.tickerInput()?.nativeElement.focus();
  }

  private toInput(): CandidateInput {
    const m = this.model();
    return {
      tradingDate: this.day(),
      ticker: m.ticker,
      // Guarded non-null by `canSave`.
      previousClose: m.previousClose!,
      pmOpen: m.pmOpen!,
      pmHigh: m.pmHigh!,
      floatMillions: m.floatMillions,
      volumeMillions: m.volumeMillions,
      locatePerShare: m.locatePerShare,
      note: m.note,
      // The form doesn't show the « À l'open » pair : an edit keeps what was typed in the card.
      ...this.atOpenOf(this.editingId()),
    };
  }

  private atOpenOf(id: string | null): Pick<CandidateInput, 'openPrice' | 'targetPushPercent'> {
    const candidate = this.candidates().find((c) => c.id === id);
    return {
      openPrice: candidate?.openPrice ?? null,
      targetPushPercent: candidate?.targetPushPercent ?? null,
    };
  }
}

/** What the open card reads from the GUS stats summary. */
interface GusSummary {
  references: PushReferences;
  rate: NoPushRate | null;
}

const NO_REFERENCES: PushReferences = {
  median: null,
  average: null,
  thirdQuartile: null,
  max: null,
};

function toCandidateInput(c: Candidate): CandidateInput {
  return {
    tradingDate: c.tradingDate,
    ticker: c.ticker,
    previousClose: c.previousClose,
    pmOpen: c.pmOpen,
    pmHigh: c.pmHigh,
    floatMillions: c.floatMillions,
    volumeMillions: c.volumeMillions,
    locatePerShare: c.locatePerShare,
    note: c.note,
    openPrice: c.openPrice,
    targetPushPercent: c.targetPushPercent,
  };
}

function isPositive(n: number | null): boolean {
  return n !== null && n > 0;
}
