import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
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
import { EMPTY, catchError, filter, finalize, from, switchMap, tap } from 'rxjs';
import { JournalRepository } from '../../../core/api/journal/journal.repository';
import { computePositionAggregates } from '../../../core/api/journal/position-aggregates';
import { TradeEntry, TradeEntryInput } from '../../../core/api/journal/trade-entry.model';
import { compressImage } from '../../../shared/image/compress-image';
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
  host: { '(document:keydown.escape)': 'closeLightbox()' },
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
  private readonly sanitizer = inject(DomSanitizer);

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  readonly entry = signal<TradeEntry | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

  // ---- Screenshot (issue #110) ----
  readonly screenshotUrl = signal<SafeUrl | null>(null);
  readonly screenshotUploading = signal(false);
  readonly dragging = signal(false);
  /** Fullscreen preview overlay (click the thumbnail to open, click / Escape to close). */
  readonly lightboxOpen = signal(false);
  /** Kept raw so we can revoke it — the signal holds the sanitized wrapper the template binds to. */
  private objectUrl: string | null = null;

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
    // Revoke the object URL when the view is torn down — otherwise the blob leaks.
    inject(DestroyRef).onDestroy(() => this.clearObjectUrl());
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.repo.findById(this.id).subscribe({
      next: (e) => {
        this.entry.set(e);
        this.loading.set(false);
        if (e.hasScreenshot) this.loadScreenshot(e.id);
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
      { data, width: '1040px', maxWidth: '95vw', autoFocus: 'first-tabbable' },
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

  removeScreenshot(): void {
    const entry = this.entry();
    if (!entry) return;
    this.repo
      .deleteScreenshot(entry.id)
      .pipe(
        tap((updated) => {
          this.entry.set(updated);
          this.clearObjectUrl();
          this.toast('journal.detail.screenshot.deleteSuccess', 'success');
        }),
        catchError(() => {
          this.toast('journal.detail.screenshot.deleteError', 'error');
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
          this.toast('journal.detail.screenshot.uploadSuccess', 'success');
        }),
        catchError(() => {
          this.toast('journal.detail.screenshot.uploadError', 'error');
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

  private toast(key: string, variant: 'success' | 'error', params?: Record<string, unknown>): void {
    this.snackBar.open(this.translate.instant(key, params), undefined, {
      duration: variant === 'success' ? 3000 : 5000,
      panelClass: `stb-snack-bar--${variant}`,
    });
  }
}
