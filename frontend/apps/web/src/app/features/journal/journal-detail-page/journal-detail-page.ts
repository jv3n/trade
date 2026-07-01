import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbChipsModule,
  StbDividerModule,
  StbIconModule,
  StbProgressSpinnerModule,
  StbTableModule,
} from '@portfolioai/ui';
import { EMPTY, catchError, filter, switchMap, tap } from 'rxjs';
import { JournalRepository } from '../../../core/api/journal/journal.repository';
import { computePositionAggregates } from '../../../core/api/journal/position-aggregates';
import { TradeEntry, TradeEntryInput } from '../../../core/api/journal/trade-entry.model';
import { AddTradeDialog, AddTradeDialogData } from '../add-trade-dialog/add-trade-dialog';

/**
 * Read-only detail view for a single journal position, reached by clicking a row in the journal
 * table (`/journal/:id`). Shows the full picture the listing table can't fit : the ordered list of
 * executions the position is built from, the derived aggregates (avg prices, realized P&L, gain%,
 * fill status), the preparation checklist and the debrief notes.
 *
 * Edit reuses the same [AddTradeDialog] as the listing ; on save the entry is refetched in place.
 * Delete confirms then navigates back to the journal. The fill `status` (OPEN / PARTIAL / CLOSED) is
 * derived client-side from the executions via [computePositionAggregates] — it isn't a stored field.
 */
@Component({
  selector: 'app-journal-detail-page',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    StbButtonModule,
    StbChipsModule,
    StbDividerModule,
    StbIconModule,
    StbProgressSpinnerModule,
    StbTableModule,
    TranslatePipe,
  ],
  templateUrl: './journal-detail-page.html',
  styleUrl: './journal-detail-page.scss',
})
export class JournalDetailPage {
  private readonly repo = inject(JournalRepository);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  readonly entry = signal<TradeEntry | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

  readonly executionColumns = ['seq', 'kind', 'shares', 'price'] as const;

  /** Fill status derived from the executions — not a stored field. */
  readonly status = computed(() => {
    const e = this.entry();
    if (!e) return null;
    return computePositionAggregates(e.direction, e.executions).status;
  });

  /** Whether every preparation-checklist box is meaningfully set — drives the read-only ticks. */
  readonly checklist = computed(() => {
    const e = this.entry();
    if (!e) return [];
    return [
      { key: 'pre935To10h', value: e.pre935To10h },
      { key: 'preGapUp50', value: e.preGapUp50 },
      { key: 'prePrice1To10', value: e.prePrice1To10 },
      { key: 'preFloat3To50m', value: e.preFloat3To50m },
      { key: 'preWaitPush', value: e.preWaitPush },
      { key: 'shortOnResistance', value: e.shortOnResistance },
    ];
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.repo.findById(this.id).subscribe({
      next: (e) => {
        this.entry.set(e);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  edit(): void {
    const entry = this.entry();
    if (!entry) return;
    const data: AddTradeDialogData = { entry };
    const ref = this.dialog.open<AddTradeDialog, AddTradeDialogData, TradeEntryInput | undefined>(
      AddTradeDialog,
      { data, width: '880px', maxWidth: '95vw', autoFocus: 'first-tabbable' },
    );
    ref
      .afterClosed()
      .pipe(
        filter((input): input is TradeEntryInput => !!input),
        switchMap((input) =>
          this.repo.update(entry.id, input).pipe(
            tap((saved) => {
              this.entry.set(saved);
              this.toast('journal.snackbar.updateSuccess', 'success', { ticker: saved.ticker });
            }),
            catchError(() => {
              this.toast('journal.snackbar.updateError', 'error');
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }

  delete(): void {
    const entry = this.entry();
    if (!entry) return;
    const confirmMsg = this.translate.instant('journal.confirmDelete', { ticker: entry.ticker });
    if (!confirm(confirmMsg)) return;

    this.repo
      .delete(entry.id)
      .pipe(
        tap(() => {
          this.toast('journal.snackbar.deleteSuccess', 'success', { ticker: entry.ticker });
          void this.router.navigate(['/journal']);
        }),
        catchError(() => {
          this.toast('journal.snackbar.deleteError', 'error');
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private toast(key: string, variant: 'success' | 'error', params?: Record<string, unknown>): void {
    this.snackBar.open(this.translate.instant(key, params), undefined, {
      duration: variant === 'success' ? 3000 : 5000,
      panelClass: `stb-snack-bar--${variant}`,
    });
  }
}
