import { DatePipe, DecimalPipe, formatNumber } from '@angular/common';
import {
  Component,
  LOCALE_ID,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbProgressSpinnerModule,
  StbToast,
} from '@portfolioai/ui';
import { format } from 'date-fns';
import { EMPTY, catchError, filter, finalize, of, switchMap, tap } from 'rxjs';
import { Reconciliation } from '../../../core/api/account/account.model';
import { AccountRepository } from '../../../core/api/account/account.repository';
import { ConfirmService } from '../../../core/app-state/confirm.service';
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';

/** Past this share of the computed balance, a gap is flagged as unusual before it is written. */
const UNUSUAL_GAP_RATIO = 0.2;

/**
 * The morning ritual (#198), as a component because it lives in **two** places : the account page
 * and step 1 of the Today page (`mockup/PARCOURS.md` › Accueil). It is the one flow in the app
 * where a figure typed by hand moves the balance, so it has exactly one implementation.
 *
 * Reads the balance it compares against from its host ([appBalance]) — both hosts already load the
 * account summary — and owns the rest : the history line, the gap, the submit. A gap creates an
 * `ADJUSTMENT` line, so it goes through the confirmation modal (the redesign's rule : confirm
 * anything that creates or deletes) ; a clean morning only timestamps itself and needs none.
 *
 * Emits [settled] once the morning is in, so the host can refetch whatever the correction moved.
 */
@Component({
  selector: 'app-morning-reconciliation',
  imports: [
    DatePipe,
    DecimalPipe,
    StbButtonModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbProgressSpinnerModule,
    NumberMaskDirective,
    TranslatePipe,
  ],
  templateUrl: './morning-reconciliation.html',
  styleUrl: './morning-reconciliation.scss',
})
export class MorningReconciliation {
  private readonly repo = inject(AccountRepository);
  private readonly confirm = inject(ConfirmService);
  private readonly translate = inject(TranslateService);
  private readonly locale = inject(LOCALE_ID);
  private readonly toasts = inject(StbToast);

  /** The app's derived balance — null while the host is still loading its summary. */
  readonly appBalance = input<number | null>(null);
  /**
   * Step 1 of the Today page drops the history to stay a single line. Declared as a boolean
   * attribute so the host writes `compact`, not `[compact]="true"`.
   */
  readonly compact = input(false, { transform: booleanAttribute });

  /** Fired once the morning is settled — the host refetches what the correction may have moved. */
  readonly settled = output<Reconciliation>();

  /** The balance TradeZero displays, as typed. Null until the user enters it. */
  readonly brokerBalance = signal<number | null>(null);
  readonly submitting = signal(false);
  readonly cancelling = signal(false);
  readonly history = signal<Reconciliation[]>([]);

  /** Live gap between the typed broker balance and the app's — null while nothing is typed. */
  readonly gap = computed(() => {
    const broker = this.brokerBalance();
    const balance = this.appBalance();
    return broker === null || balance === null ? null : broker - balance;
  });

  /** The broker never shows a negative balance : refused on the field, before any gap (#307). */
  readonly negativeBalance = computed(() => (this.brokerBalance() ?? 0) < 0);

  /**
   * A gap past a fifth of the computed balance (#307). It still goes through — a real drift can be
   * that big after a long gap in the reconciliations — but at that size it is a typo far more
   * often, so the confirmation says so and reads as a warning.
   */
  readonly unusualGap = computed(() => {
    const gap = this.gap();
    const balance = this.appBalance();
    if (gap === null || gap === 0 || balance === null) return false;
    return balance === 0 || Math.abs(gap) > UNUSUAL_GAP_RATIO * Math.abs(balance);
  });

  /** Today's reconciliation, when this morning is already settled. */
  readonly today = computed(() => {
    const day = format(new Date(), 'yyyy-MM-dd');
    return this.history().find((r) => format(r.valueDate, 'yyyy-MM-dd') === day) ?? null;
  });

  constructor() {
    this.loadHistory();
  }

  setBrokerBalance(value: number | null): void {
    this.brokerBalance.set(value);
  }

  /**
   * Erases a morning typed by mistake (#249) — the reconciliation and the correction it produced go
   * together, and the balance returns to where it stood before it. Distinct from re-posting the
   * day, which *corrects* the morning : here the point is that it never happened.
   *
   * Always confirmed, danger variant : it deletes, and a clean morning is as much a record as a
   * corrected one.
   */
  cancel(reconciliation: Reconciliation): void {
    if (this.cancelling()) return;
    this.confirm
      .ask('account.reconciliation.confirmCancel', { variant: 'danger' })
      .pipe(
        filter(Boolean),
        tap(() => this.cancelling.set(true)),
        switchMap(() =>
          this.repo.cancelReconciliation(reconciliation.id).pipe(
            tap(() => {
              this.toasts.success(
                this.translate.instant('account.snackbar.cancelReconciliationSuccess'),
              );
              this.loadHistory();
              // The host refetches : the correction that just went moved the balance.
              this.settled.emit(reconciliation);
            }),
            catchError(() => {
              this.toasts.error(
                this.translate.instant('account.snackbar.cancelReconciliationError'),
              );
              return EMPTY;
            }),
            finalize(() => this.cancelling.set(false)),
          ),
        ),
      )
      .subscribe();
  }

  /**
   * « Aucun écart » (#407) — most mornings TradeZero shows the app's own balance : reconciles at it
   * without typing it back. A zero gap, so no correction and no confirmation.
   */
  reconcileNoGap(): void {
    const balance = this.appBalance();
    if (balance === null) return;
    this.brokerBalance.set(balance);
    this.submit();
  }

  submit(): void {
    const broker = this.brokerBalance();
    // No app balance = no gap to show, so a submit here would slip past the confirmation below and
    // let the backend write whatever its own balance implies. The window is the host's summary
    // still loading — seconds on a cold start (#307).
    if (broker === null || this.appBalance() === null) return;
    if (this.submitting() || this.negativeBalance()) return;
    const gap = this.gap();

    const confirmed =
      gap !== null && gap !== 0
        ? this.confirm.ask(
            this.unusualGap()
              ? 'account.reconciliation.confirmUnusualCorrection'
              : 'account.reconciliation.confirmCorrection',
            {
              // The modal reads like the page around it : same locale, same two decimals.
              params: {
                gap: formatNumber(gap, this.locale, '1.2-2'),
                balance: formatNumber(this.appBalance() ?? 0, this.locale, '1.2-2'),
              },
              variant: this.unusualGap() ? 'danger' : undefined,
            },
          )
        : of(true);

    confirmed
      .pipe(
        filter(Boolean),
        tap(() => this.submitting.set(true)),
        switchMap(() =>
          this.repo.reconcile({ brokerBalance: broker, valueDate: new Date() }).pipe(
            tap((reconciliation) => {
              this.toasts.success(
                this.translate.instant(
                  reconciliation.correctionId
                    ? 'account.snackbar.correctSuccess'
                    : 'account.snackbar.reconcileSuccess',
                ),
              );
              this.brokerBalance.set(null);
              this.loadHistory();
              this.settled.emit(reconciliation);
            }),
            catchError(() => {
              this.toasts.error(this.translate.instant('account.snackbar.reconcileError'));
              return EMPTY;
            }),
            finalize(() => this.submitting.set(false)),
          ),
        ),
      )
      .subscribe();
  }

  /**
   * The history is a recap, not the reason the host page exists : a failure empties the line rather
   * than raising an error banner over the balance.
   */
  private loadHistory(): void {
    this.repo.reconciliations().subscribe({
      next: (rows) => this.history.set(rows),
      error: () => this.history.set([]),
    });
  }
}
