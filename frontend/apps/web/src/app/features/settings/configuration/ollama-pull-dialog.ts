import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { MatDialogRef } from '@angular/material/dialog';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbDialogModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbProgressSpinnerModule,
  StbTooltipModule,
} from '@portfolioai/ui';
import { OllamaStatusService } from '../../../core/api/analysis/ollama-status.service';

/**
 * Suggestions re-used from the LLM provider card on `/settings/configuration` so the dialog
 * stays consistent with the autocomplete the user already saw on the model field. Identical
 * keys, deliberately duplicated rather than extracted to a shared module — the two surfaces
 * are unlikely to diverge often, and an early factor would couple them prematurely.
 */
const OLLAMA_MODEL_SUGGESTIONS = [
  'qwen2.5:3b',
  'qwen2.5:7b',
  'llama3.2:3b',
  'llama3.1:8b',
  'mistral:7b',
  'phi4-mini',
];

/**
 * Modal that asks the user for a model tag (e.g. `mistral:7b`) and triggers a backend pull.
 *
 * **Lifecycle** : opened from the `OllamaStatusPanel` "Pull…" button. The user types or picks
 * a suggestion, clicks Pull, and the dialog enters a busy state — buttons disabled, spinner +
 * "Pulling mistral:7b…" inline. The pull blocks the backend request thread 1-3 min ; on
 * success the dialog closes (the panel's `availableModels` already reflects the new entry
 * because the service updates the shared signal). On failure the dialog stays open with an
 * inline error message so the user can correct the typo without losing the form state.
 *
 * **Hors scope v1** :
 * - No progress bar — `stream: true` would expose a per-percent feed but requires SSE plumbing
 *   that doesn't exist for this endpoint yet (filed as a follow-up).
 * - No cancel of an in-flight pull — Ollama doesn't expose a clean abort.
 * - No 404-from-test-result auto-promotion — the dialog is independent of the "Tester" card.
 */
@Component({
  selector: 'app-ollama-pull-dialog',

  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    StbButtonModule,
    StbDialogModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbProgressSpinnerModule,
    StbTooltipModule,
  ],
  templateUrl: './ollama-pull-dialog.html',
  styleUrl: './ollama-pull-dialog.scss',
})
export class OllamaPullDialog {
  private readonly statusService = inject(OllamaStatusService);
  private readonly dialogRef = inject(MatDialogRef<OllamaPullDialog>);
  private readonly translate = inject(TranslateService);

  readonly suggestions = OLLAMA_MODEL_SUGGESTIONS;

  readonly modelControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(1)],
  });

  /** True while the backend pull is in flight. Disables the form and surfaces the spinner. */
  readonly busy = signal(false);
  /** Inline error rendered below the input — populated on a failed pull, reset on retry. */
  readonly error = signal<string | null>(null);

  /**
   * Set of model names already pulled locally, derived from the panel's polled snapshot. The
   * dialog renders a check icon on any suggestion present in this set so the user can tell at
   * a glance which tags are local. Re-pull is allowed (useful for picking up an upstream
   * update), so we don't disable already-pulled suggestions — only the check icon differs.
   */
  private readonly pulledSet = computed(
    () => new Set(this.statusService.status()?.availableModels ?? []),
  );

  /**
   * Locally-pulled models that are NOT in [suggestions] — typically things the user pulled by
   * hand (e.g. `gemma2:9b`) that we don't bake into the static suggestion list. Rendered as a
   * second row so they're discoverable + re-clickable without leaving the dialog.
   */
  readonly otherPulled = computed(() => {
    const all = this.statusService.status()?.availableModels ?? [];
    const suggestionSet = new Set(this.suggestions);
    return all.filter((name) => !suggestionSet.has(name));
  });

  isPulled(name: string): boolean {
    return this.pulledSet().has(name);
  }

  selectSuggestion(name: string): void {
    if (this.busy()) return;
    this.modelControl.setValue(name);
  }

  pull(): void {
    if (this.busy()) return;
    const raw = this.modelControl.value.trim();
    if (raw === '') return;

    this.busy.set(true);
    this.error.set(null);
    this.statusService.pull(raw).subscribe({
      next: (snap) => {
        // The backend returns a snapshot with `daemonReachable: false` on a failed pull (mirror
        // of the unload contract). Treat that as a user-visible error rather than a success.
        if (!snap.daemonReachable) {
          this.error.set(
            snap.errorMessage ??
              this.translate.instant(
                'settings.configurationPage.ollamaStatus.pullDialog.errors.pullFailed',
              ),
          );
          this.busy.set(false);
          return;
        }
        this.busy.set(false);
        this.dialogRef.close(raw);
      },
      error: (err: unknown) => {
        this.error.set(
          err instanceof Error
            ? err.message
            : this.translate.instant(
                'settings.configurationPage.ollamaStatus.pullDialog.errors.pullFailed',
              ),
        );
        this.busy.set(false);
      },
    });
  }

  cancel(): void {
    if (this.busy()) return;
    this.dialogRef.close(null);
  }

  /**
   * Deletes [name] from the daemon's local cache. The check icon disappears from the chip on
   * the next signal update (driven by the service re-probe). Disabled while a pull is in
   * flight to avoid concurrent mutations on the same model.
   */
  delete(name: string): void {
    if (this.busy()) return;
    this.error.set(null);
    this.statusService.delete(name).subscribe({
      error: (err: unknown) => {
        this.error.set(
          err instanceof Error
            ? err.message
            : this.translate.instant(
                'settings.configurationPage.ollamaStatus.pullDialog.errors.deleteFailed',
              ),
        );
      },
    });
  }
}
