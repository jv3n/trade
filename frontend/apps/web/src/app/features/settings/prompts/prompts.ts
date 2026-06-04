import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, NgClass, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  PromptEnvelope,
  PromptRepository,
  PromptTemplate,
} from '../../../core/api/analysis/prompt.repository';

/**
 * Settings → Prompts (Phase 3 PR3 list + view + activate, PR4 inline editor + diff + create
 * new version). The page is a thin presentation layer over the [PromptRepository] ; what we
 * pin is the user-facing contract :
 *
 * - **List** : every persisted version surfaces as a card with version + chip (active /
 *   inactive) + dates.
 * - **Expand** : clicking the card header shows the system prompt body. Mutual exclusion via
 *   `expandedId: string | null` — only one body open at a time.
 * - **Activate (PR3)** : optimistic local flip (target → active, others → inactive), API call,
 *   re-fetch list on success / rollback on failure.
 * - **Edit (PR4)** : « Save as new version » opens an inline editor prefilled with the source
 *   row. The editor exposes : version tag input, notes input, system prompt textarea, and a
 *   line-based diff vs the source (greenadded / red removed / dim unchanged). « Save » POSTs a
 *   new row (`isActive = false`) — activation stays explicit via the existing PR3 button on
 *   the freshly-created row.
 *
 * PR5 will add the thumbs 👍/👎 on the dossier ticker (different page) ; PR6 will link each
 * row's header to a `/settings/prompts/{id}/stats` sub-page. Both leave this view intact.
 */
@Component({
  selector: 'app-prompts',
  imports: [
    DatePipe,
    NgClass,
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    TranslatePipe,
  ],
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

  // -------------------------------------------------------------------- envelope state
  // The technical envelope is a static, read-only string appended after the editable body
  // when the narrative prompt is assembled. Loaded lazily on first user expand to avoid a
  // round-trip on the initial page load (the panel is collapsed by default).
  envelope = signal<PromptEnvelope | null>(null);
  envelopeOpen = signal<boolean>(false);
  envelopeLoading = signal<boolean>(false);
  envelopeError = signal<string | null>(null);

  // -------------------------------------------------------------------- editor state (PR4)

  /** Id of the source row whose card has the editor open. Null = no editor visible. */
  editorSourceId = signal<string | null>(null);
  /** Editable buffer for the new version's tag (e.g. "v3-bullish-fix"). */
  editorVersion = signal<string>('');
  /** Editable buffer for the new system prompt body. */
  editorSystemPrompt = signal<string>('');
  /** Editable buffer for the optional notes (« why this version exists »). */
  editorNotes = signal<string>('');
  /** Non-null while the POST is in flight ; blocks concurrent saves. */
  saving = signal<boolean>(false);
  /** Inline banner when the POST fails — null = no error. */
  saveError = signal<string | null>(null);

  /**
   * The source row whose editor is open, resolved from the signal. Computed so the template can
   * read it directly without juggling `find()` calls.
   */
  editorSource = computed<PromptTemplate | null>(() => {
    const id = this.editorSourceId();
    if (id === null) return null;
    return this.prompts().find((p) => p.id === id) ?? null;
  });

  /**
   * Line-based diff between the source row's prompt and the editor buffer. Computed so the
   * template re-renders on every keystroke without an explicit subscribe.
   */
  diff = computed<DiffLine[]>(() => {
    const source = this.editorSource();
    if (!source) return [];
    return lineDiff(source.systemPrompt, this.editorSystemPrompt());
  });

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
    // Closing the expanded card also closes the editor — UX consistency : the editor lives
    // inside the body, you shouldn't see it on a card you can't see the body of.
    if (this.expandedId() === id) {
      this.expandedId.set(null);
      if (this.editorSourceId() === id) this.closeEditor();
    } else {
      this.expandedId.set(id);
    }
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

  // -------------------------------------------------------------------- editor actions (PR4)

  openEditor(source: PromptTemplate) {
    // Prefill the editor with the source row. Suggest a version tag derived from the source
    // (e.g. v2 → v2-edit) so the user has a non-empty starting point — they typically rewrite
    // it before saving anyway.
    this.editorSourceId.set(source.id);
    this.editorVersion.set(`${source.version}-edit`);
    this.editorSystemPrompt.set(source.systemPrompt);
    this.editorNotes.set('');
    this.saveError.set(null);
  }

  closeEditor() {
    this.editorSourceId.set(null);
    this.editorVersion.set('');
    this.editorSystemPrompt.set('');
    this.editorNotes.set('');
    this.saveError.set(null);
  }

  hasEditorChanges(): boolean {
    const source = this.editorSource();
    if (!source) return false;
    return source.systemPrompt !== this.editorSystemPrompt();
  }

  canSave(): boolean {
    return (
      !this.saving() &&
      this.editorVersion().trim().length > 0 &&
      this.editorSystemPrompt().trim().length > 0
    );
  }

  // -------------------------------------------------------------------- envelope toggle

  /**
   * Toggles the collapsible technical-envelope panel. Lazy-loads the envelope on the first
   * open ; subsequent opens reuse the cached signal (the envelope is immutable per backend
   * version, no need to refresh).
   */
  toggleEnvelope() {
    const next = !this.envelopeOpen();
    this.envelopeOpen.set(next);
    if (next && this.envelope() === null && !this.envelopeLoading()) {
      this.loadEnvelope();
    }
  }

  private loadEnvelope() {
    this.envelopeLoading.set(true);
    this.envelopeError.set(null);
    this.repo.getEnvelope().subscribe({
      next: (env) => {
        this.envelope.set(env);
        this.envelopeLoading.set(false);
      },
      error: () => {
        this.envelopeError.set(this.translate.instant('settings.promptsPage.envelopeLoadError'));
        this.envelopeLoading.set(false);
      },
    });
  }

  saveDraft() {
    const source = this.editorSource();
    if (!source || !this.canSave()) return;
    this.saving.set(true);
    this.saveError.set(null);

    this.repo
      .create({
        name: source.name,
        version: this.editorVersion().trim(),
        systemPrompt: this.editorSystemPrompt(),
        notes: this.editorNotes().trim() || null,
      })
      .subscribe({
        next: (created) => {
          this.saving.set(false);
          // Close the editor, re-fetch the list to show the new row, and expand it so the user
          // sees what they just saved.
          this.closeEditor();
          this.loadList();
          this.expandedId.set(created.id);
        },
        error: (err) => {
          this.saving.set(false);
          const detail =
            err?.error?.error ?? this.translate.instant('settings.promptsPage.errors.create');
          this.saveError.set(detail);
        },
      });
  }
}

// -------------------------------------------------------------------- line-based diff helper

/**
 * One line of a line-based diff, tagged with its origin :
 * - `unchanged` — present in both source and target ; rendered dim.
 * - `removed` — present only in source ; rendered with a `-` prefix and a red tint.
 * - `added` — present only in target ; rendered with a `+` prefix and a green tint.
 */
export interface DiffLine {
  kind: 'unchanged' | 'removed' | 'added';
  line: string;
}

/**
 * Computes a line-based diff between [oldText] and [newText] via dynamic-programming LCS.
 * `O(n × m)` time and memory, where `n` / `m` are the line counts. For narrative prompts
 * (typically 20-50 lines), that's negligible — ~2500 cells.
 *
 * Exported (not private to the component) so tests can pin the algorithm independently of the
 * UI : « given these two strings, the diff has exactly these N hunks in this order ». The
 * component just renders what this returns.
 */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = length of the longest common subsequence of a[..i-1] and b[..j-1].
  const lcs: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  // Backtrack from (n, m) to (0, 0) collecting diff segments in reverse, then flip.
  const out: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      out.push({ kind: 'unchanged', line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      out.push({ kind: 'added', line: b[j - 1] });
      j--;
    } else {
      out.push({ kind: 'removed', line: a[i - 1] });
      i--;
    }
  }
  return out.reverse();
}
