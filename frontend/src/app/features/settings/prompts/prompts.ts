import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, NgClass } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PromptRepository, PromptTemplate } from '../../../core/prompt.repository';

/**
 * Settings → Prompts (Phase 3 PR3). Lists every persisted version of the narrative prompt,
 * shows the system prompt body on expand, and exposes an « Activate » button to flip the
 * runtime prompt without a backend reboot.
 *
 * **Optimistic activate** — the click flips the local list immediately (target row to active,
 * any other active row in the family to inactive). On API failure we roll back and surface an
 * error banner. The chip + the button visibility update reactively from the signal.
 *
 * PR4 will add a « Save as new version » action above the system prompt block ; PR6 will link
 * each row's header to a `/settings/prompts/{id}/stats` sub-page. Both leave this list view
 * intact.
 */
@Component({
  selector: 'app-prompts',
  imports: [DatePipe, NgClass, MatProgressSpinnerModule, MatIconModule, TranslatePipe],
  templateUrl: './prompts.html',
  styleUrl: './prompts.scss',
})
export class PromptsPage implements OnInit {
  private readonly repo = inject(PromptRepository);
  private readonly translate = inject(TranslateService);

  // Default family for v1 — the backend endpoint forwards a custom `name` param if we ever need
  // to render a different family page from the same component (forward-compat for Phase 4).
  private readonly family = 'narrative-default';

  prompts = signal<PromptTemplate[]>([]);
  loading = signal(true);
  loadError = signal<string | null>(null);
  expandedId = signal<string | null>(null);
  activatingId = signal<string | null>(null);
  activateError = signal<string | null>(null);

  activePrompt = computed(() => this.prompts().find((p) => p.isActive) ?? null);

  ngOnInit() {
    this.loadList();
  }

  loadList() {
    this.loading.set(true);
    this.loadError.set(null);
    this.repo.list(this.family).subscribe({
      next: (rows) => {
        this.prompts.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(this.translate.instant('settings.promptsPage.errors.loadList'));
        this.loading.set(false);
      },
    });
  }

  toggle(id: string) {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  activate(target: PromptTemplate) {
    if (target.isActive || this.activatingId() !== null) return;
    this.activatingId.set(target.id);
    this.activateError.set(null);

    // Optimistic local flip — the target row to active, any other active row in the same family
    // to inactive (mirrors the server-side flip). We capture the snapshot to roll back on error.
    const snapshot = this.prompts();
    this.prompts.set(
      snapshot.map((p) => {
        if (p.id === target.id) return { ...p, isActive: true };
        if (p.name === target.name && p.isActive) return { ...p, isActive: false };
        return p;
      }),
    );

    this.repo.activate(target.id).subscribe({
      next: (activated) => {
        // Server may have stamped `activated_at` / `deprecated_at` — re-list to pick them up.
        // Cheap : one round-trip on a manual user action, no hot loop.
        this.activatingId.set(null);
        this.loadList();
        // Hint the activated row stays expanded so the user sees the body that's now live.
        this.expandedId.set(activated.id);
      },
      error: () => {
        // Roll back the optimistic flip — the user sees the list snap back to the previous state.
        this.prompts.set(snapshot);
        this.activatingId.set(null);
        this.activateError.set(
          this.translate.instant('settings.promptsPage.errors.activate', {
            version: target.version,
          }),
        );
      },
    });
  }

  isExpanded(id: string): boolean {
    return this.expandedId() === id;
  }

  isActivating(id: string): boolean {
    return this.activatingId() === id;
  }
}
