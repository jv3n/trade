import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbProgressSpinnerModule,
} from '@portfolioai/ui';
import { format } from 'date-fns';
import { EMPTY, catchError, filter, finalize, of, switchMap, tap } from 'rxjs';
import { Reconciliation } from '../../../core/api/account/account.model';
import { AccountRepository } from '../../../core/api/account/account.repository';
import { ConfirmService } from '../../../core/app-state/confirm.service';
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';

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
  private readonly snackBar = inject(MatSnackBar);

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
  readonly history = signal<Reconciliation[]>([]);

  /** Live gap between the typed broker balance and the app's — null while nothing is typed. */
  readonly gap = computed(() => {
    const broker = this.brokerBalance();
    const balance = this.appBalance();
    return broker === null || balance === null ? null : broker - balance;
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

  submit(): void {
    const broker = this.brokerBalance();
    if (broker === null || this.submitting()) return;
    const gap = this.gap();

    const confirmed =
      gap !== null && gap !== 0
        ? this.confirm.ask('account.reconciliation.confirmCorrection', {
            params: { gap: gap.toFixed(2) },
          })
        : of(true);

    confirmed
      .pipe(
        filter(Boolean),
        tap(() => this.submitting.set(true)),
        switchMap(() =>
          this.repo.reconcile({ brokerBalance: broker, valueDate: new Date() }).pipe(
            tap((reconciliation) => {
              this.toast(
                reconciliation.correctionId
                  ? 'account.snackbar.correctSuccess'
                  : 'account.snackbar.reconcileSuccess',
                'success',
              );
              this.brokerBalance.set(null);
              this.loadHistory();
              this.settled.emit(reconciliation);
            }),
            catchError(() => {
              this.toast('account.snackbar.reconcileError', 'error');
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

  private toast(key: string, variant: 'success' | 'error'): void {
    this.snackBar.open(this.translate.instant(key), undefined, {
      duration: variant === 'success' ? 3000 : 5000,
      panelClass: `stb-snack-bar--${variant}`,
    });
  }
}
