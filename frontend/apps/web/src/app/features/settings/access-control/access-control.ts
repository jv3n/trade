import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfigRepository } from '../../../core/api/config/config.repository';
import {
  StbButtonModule,
  StbChipsModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbProgressSpinnerModule,
} from '@portfolioai/ui';

const ALLOWED_EMAILS_KEY = 'app.allowed.emails';

/**
 * `/settings/access-control` — single-purpose page that edits the `app.allowed.emails` runtime
 * config slot. Admin-only (gated by `adminGuard` on the parent `/settings` route).
 *
 * The page maintains the email list as a local [signal] of `string[]`. On mount it loads the
 * current value via [ConfigRepository.list], splits the CSV stored backend-side, and presents the
 * chips in a **visible `mat-chip-set`** above the input (separated from the editor for clarity —
 * the canonical `mat-chip-grid` pattern hides chips inside the form-field, which made the current
 * list hard to spot when the page was first reached). The input below is a standalone
 * `mat-form-field` that fires `addCandidate` on Enter or on the suffix `+` button. Removing fires
 * the `(removed)` event on each chip. Save serialises back to CSV and PUTs ; saving an **empty**
 * list goes through `reset` (DELETE → fall back to the YAML default = open mode) instead of `set`
 * (which rejects blank values).
 *
 * **Why a signal mutated locally then explicit Save** instead of write-on-each-change : an admin
 * editing the list typically adds several entries before they're done. A live save would mean
 * 1 PUT per add — noisy in logs, slow on a connection that's not on localhost. Explicit Save
 * matches the rhythm of the existing /settings/configuration page (same Save / Reset pattern).
 *
 * **Open mode communication** — when the effective list is empty, the page renders an `openModeNote`
 * banner telling the admin that gating is OFF and that posting the first email activates it. This
 * is the most important UX detail of the page : silent open mode would be a footgun.
 */
@Component({
  selector: 'app-access-control',
  imports: [
    StbButtonModule,
    StbChipsModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbProgressSpinnerModule,
    TranslatePipe,
  ],
  templateUrl: './access-control.html',
  styleUrl: './access-control.scss',
})
export class AccessControlPage implements OnInit {
  private readonly repo = inject(ConfigRepository);
  private readonly translate = inject(TranslateService);

  readonly emails = signal<string[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal(false);
  readonly saveError = signal(false);
  readonly saved = signal(false);
  /** Email value the user just tried to add but that didn't pass front validation (no '@'). */
  readonly invalidInput = signal<string | null>(null);

  /** True when no email is configured — gating is OFF, anyone with a Google account is let in. */
  readonly isOpenMode = computed(() => this.emails().length === 0);

  ngOnInit(): void {
    this.loadEntry();
  }

  private loadEntry(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.repo.list().subscribe({
      next: (entries) => {
        const entry = entries.find((e) => e.key === ALLOWED_EMAILS_KEY);
        this.emails.set(this.parseCsv(entry?.currentValue ?? ''));
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  /**
   * Validates and appends `value` to the chip list (no save side effect — explicit Save handles
   * persistence). Trim + lowercase + dedup against the current set. Returns `true` when the chip
   * was added so the template can clear the input on success ; returns `false` on a malformed
   * token (no `@`) so the template can keep the typed value visible for the admin to correct it.
   */
  addCandidate(value: string): boolean {
    const raw = (value ?? '').trim().toLowerCase();
    if (raw.length === 0) return true;
    // Mirror the backend strict validation : must contain '@'. Front-stops the typo at input time
    // so the user sees the inline hint before Save (and the same rule on the backend defends if
    // they bypass the UI via curl).
    if (!raw.includes('@')) {
      this.invalidInput.set(raw);
      return false;
    }
    this.invalidInput.set(null);
    if (!this.emails().includes(raw)) {
      this.emails.update((list) => [...list, raw].sort());
      this.saved.set(false);
    }
    return true;
  }

  removeEmail(email: string): void {
    this.emails.update((list) => list.filter((e) => e !== email));
    this.saved.set(false);
  }

  /**
   * Template handler for the input's `(keydown.enter)` event. Splits the "validate + maybe clear"
   * logic out of the template so the clear-DOM path is unit-testable. `preventDefault` always
   * fires to suppress a hypothetical form submit ; the input value is cleared only when
   * [addCandidate] accepted the value (returned true). On a rejected value (no `@`), the typed
   * text stays in the input so the admin can correct it without retyping.
   */
  onAddKeydown(event: Event, value: string): void {
    event.preventDefault();
    if (this.addCandidate(value)) {
      (event.target as HTMLInputElement).value = '';
    }
  }

  /**
   * Template handler for the suffix `+` button. Mirrors [onAddKeydown] minus the
   * `preventDefault` (a button click has no default to suppress).
   */
  onAddClick(input: HTMLInputElement): void {
    if (this.addCandidate(input.value)) {
      input.value = '';
    }
  }

  removeAriaLabel(email: string): string {
    return this.translate.instant('settings.accessControlPage.removeAriaLabel', { email });
  }

  invalidEmailMessage(): string | null {
    const value = this.invalidInput();
    if (value === null) return null;
    return this.translate.instant('settings.accessControlPage.invalidEmail', { value });
  }

  save(): void {
    this.saving.set(true);
    this.saveError.set(false);
    this.saved.set(false);
    const onSuccess = () => {
      this.saving.set(false);
      this.saved.set(true);
    };
    const onError = () => {
      this.saving.set(false);
      this.saveError.set(true);
    };
    const csv = this.emails().join(',');
    // Branch on the empty-list case rather than `?:`-ing the Observable. `repo.reset` returns
    // `Observable<void>` and `repo.set` returns `Observable<ConfigEntry>` — TypeScript can't merge
    // their `.subscribe` signatures cleanly on a union, even though both accept the same handler
    // shape at runtime. Split branches avoid TS2349.
    if (csv.length === 0) {
      this.repo.reset(ALLOWED_EMAILS_KEY).subscribe({ next: onSuccess, error: onError });
    } else {
      this.repo.set(ALLOWED_EMAILS_KEY, csv).subscribe({ next: onSuccess, error: onError });
    }
  }

  reset(): void {
    this.saving.set(true);
    this.saveError.set(false);
    this.saved.set(false);
    this.repo.reset(ALLOWED_EMAILS_KEY).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        this.loadEntry();
      },
      error: () => {
        this.saving.set(false);
        this.saveError.set(true);
      },
    });
  }

  private parseCsv(csv: string): string[] {
    // Dedup via Set after lowercasing : backend strict-validation rejects malformed tokens at save
    // time, but legacy DB rows could still carry case-insensitive duplicates (`alice@x.com` and
    // `Alice@X.com`). Front normalises so the chip list shows one entry per email.
    return Array.from(
      new Set(
        csv
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.length > 0),
      ),
    ).sort();
  }
}
