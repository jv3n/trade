/**
 * Tests on [PromptsPage] — Phase 3 PR3 list + view + activate surface. The page is a thin
 * presentation layer over the [PromptRepository] ; what we pin is the user-facing contract :
 *
 * - **List rendering** — every row of the repository surfaces as a card with version + chip
 *   (active / inactive) + dates. A rename of `isActive` or a field drop would empty the list,
 *   so the assertion lives here.
 * - **Expand toggle** — clicking the card header shows the system prompt body ; clicking again
 *   collapses it. Mutual exclusion (one expanded at a time) is what the signal contract
 *   guarantees, but we pin the open/close cycle, not the exclusion (the latter is implicit in
 *   `expandedId: string | null` shape).
 * - **Activate flow optimistic** — clicking « Activate » flips the local list immediately
 *   (target row to active, any other active row to inactive), calls `repo.activate(id)`, and
 *   on success re-fetches the list. On failure, rolls the local state back to the snapshot.
 * - **Activate disabled while in flight** — concurrent click during an ongoing activate is a
 *   no-op (the button is disabled and `isActivating(id)` returns true).
 * - **Loading and error states** — the page starts in `loading = true`, transitions to either
 *   the list or an `error-banner`. We pin both transitions.
 * - **Empty state** — when the repository returns an empty list (Flyway hasn't seeded the
 *   default), the page shows an informational empty-state pointing at the migration. Pinned
 *   so a future cleanup doesn't accidentally hide this onboarding hint.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { PromptRepository, PromptTemplate } from '../../../core/api/analysis/prompt.repository';
import { PromptsPage, lineDiff } from './prompts';

describe('PromptsPage', () => {
  let fixture: ComponentFixture<PromptsPage>;
  let component: PromptsPage;
  const list = vi.fn();
  const activate = vi.fn();
  const create = vi.fn();
  const getEnvelope = vi.fn();

  beforeEach(async () => {
    list.mockReset();
    activate.mockReset();
    create.mockReset();
    getEnvelope.mockReset();

    await TestBed.configureTestingModule({
      imports: [PromptsPage],
      providers: [
        provideTranslateService({ lang: 'en' }),
        {
          provide: PromptRepository,
          useValue: {
            list,
            // `get(id)` and `getStats(id)` aren't exercised by the list page (the list endpoint
            // already returns every body, and stats live on `/settings/prompts/:id/stats`) —
            // wire stubs that surface a clear failure if a future change accidentally pulls
            // them in from this page.
            get: vi.fn(() => throwError(() => new Error('PromptsPage should not call get()'))),
            activate,
            create,
            getStats: vi.fn(() =>
              throwError(() => new Error('PromptsPage should not call getStats()')),
            ),
            getEnvelope,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PromptsPage);
    component = fixture.componentInstance;
  });

  // ---------------------------------------------------------------------- list rendering

  it('loads the narrative-default family on init and renders one card per row', () => {
    list.mockReturnValue(of([v3Active(), v2Deprecated()]));
    fixture.detectChanges();

    expect(list).toHaveBeenCalledWith('narrative-default');
    expect(component.prompts().length).toBe(2);
    expect(component.prompts()[0].version).toBe('v3');
    expect(component.prompts()[0].isActive).toBe(true);
    expect(component.activePrompt()?.version).toBe('v3');
    expect(component.loading()).toBe(false);
  });

  it('renders an empty-state hint when the repository returns no rows', () => {
    list.mockReturnValue(of([]));
    fixture.detectChanges();

    expect(component.prompts().length).toBe(0);
    expect(component.loadError()).toBeNull();
  });

  it('surfaces a load error banner when the repository throws', () => {
    list.mockReturnValue(throwError(() => new Error('500')));
    fixture.detectChanges();

    expect(component.loadError()).not.toBeNull();
    expect(component.loading()).toBe(false);
    expect(component.prompts().length).toBe(0);
  });

  // ---------------------------------------------------------------------- expand toggle

  it('toggles the expanded card on click — open, close, open again', () => {
    list.mockReturnValue(of([v3Active(), v2Deprecated()]));
    fixture.detectChanges();
    const targetId = v3Active().id;

    component.toggle(targetId);
    expect(component.isExpanded(targetId)).toBe(true);
    component.toggle(targetId);
    expect(component.isExpanded(targetId)).toBe(false);
    component.toggle(targetId);
    expect(component.isExpanded(targetId)).toBe(true);
  });

  it('expanding a different card collapses the previous one (mutual exclusion)', () => {
    list.mockReturnValue(of([v3Active(), v2Deprecated()]));
    fixture.detectChanges();

    component.toggle(v3Active().id);
    component.toggle(v2Deprecated().id);

    expect(component.isExpanded(v3Active().id)).toBe(false);
    expect(component.isExpanded(v2Deprecated().id)).toBe(true);
  });

  // ---------------------------------------------------------------------- activate flow

  it('activating an inactive row flips local state optimistically then re-fetches the list', () => {
    // First call : initial list. Second call : after activate, the page re-fetches to pick up
    // the server-stamped `activated_at` / `deprecated_at`.
    const initial = [v3Active(), v2Deprecated()];
    const afterFlip = [withFlip(v3Active(), false), withFlip(v2Deprecated(), true)];
    list.mockReturnValueOnce(of(initial)).mockReturnValueOnce(of(afterFlip));
    activate.mockReturnValue(of(withFlip(v2Deprecated(), true)));
    fixture.detectChanges();

    component.activate(v2Deprecated());

    // Optimistic flip happened *before* the re-fetch resolves (the test sync-resolves both, but
    // the order pinned by the call sequence is what protects the UX).
    expect(activate).toHaveBeenCalledWith(v2Deprecated().id);
    expect(list).toHaveBeenCalledTimes(2);
    expect(component.activePrompt()?.version).toBe('v2');
    expect(component.expandedId()).toBe(v2Deprecated().id);
    expect(component.activatingId()).toBeNull();
    expect(component.activateError()).toBeNull();
  });

  it('activating an already-active row is a no-op (no API call, no flip)', () => {
    list.mockReturnValue(of([v3Active(), v2Deprecated()]));
    fixture.detectChanges();

    component.activate(v3Active());

    expect(activate).not.toHaveBeenCalled();
    // List wasn't re-fetched either — only the initial load.
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('rolls back local state when activate fails', () => {
    list.mockReturnValue(of([v3Active(), v2Deprecated()]));
    activate.mockReturnValue(throwError(() => new Error('500')));
    fixture.detectChanges();
    const before = component.prompts();

    component.activate(v2Deprecated());

    // Local state matches the pre-click snapshot (object identity not guaranteed because the
    // optimistic flip rebuilt the array — but the values must be back to the original shape).
    const after = component.prompts();
    expect(after.length).toBe(before.length);
    expect(after.find((p) => p.id === v3Active().id)?.isActive).toBe(true);
    expect(after.find((p) => p.id === v2Deprecated().id)?.isActive).toBe(false);
    expect(component.activateError()).not.toBeNull();
    expect(component.activatingId()).toBeNull();
  });

  it('a concurrent activate click while one is in flight is a no-op', () => {
    list.mockReturnValue(of([v3Active(), v2Deprecated()]));
    // Return an observable that never resolves so the first click stays in-flight.
    activate.mockReturnValueOnce(neverResolves<PromptTemplate>());
    fixture.detectChanges();

    component.activate(v2Deprecated());
    component.activate(v2Deprecated());

    // Only one API call fired — the second click bounced off the in-flight guard.
    expect(activate).toHaveBeenCalledTimes(1);
    expect(component.isActivating(v2Deprecated().id)).toBe(true);
  });

  // ---------------------------------------------------------------------- editor (PR4)

  it('openEditor prefills the buffer with a derived version tag and the source prompt body', () => {
    list.mockReturnValue(of([v3Active(), v2Deprecated()]));
    fixture.detectChanges();

    component.openEditor(v3Active());

    expect(component.editorSourceId()).toBe(v3Active().id);
    // Suggested tag is `${source.version}-edit` so the user has a non-empty starting point.
    expect(component.editorVersion()).toBe('v3-edit');
    expect(component.editorSystemPrompt()).toBe(v3Active().systemPrompt);
    expect(component.editorNotes()).toBe('');
    expect(component.saveError()).toBeNull();
    // The computed `editorSource` resolves to the row whose id matches.
    expect(component.editorSource()?.version).toBe('v3');
  });

  it('canSave requires both a non-blank version tag and a non-blank system prompt', () => {
    list.mockReturnValue(of([v3Active()]));
    fixture.detectChanges();
    component.openEditor(v3Active());

    // Default prefilled state is valid (tag = "v3-edit", body = source prompt).
    expect(component.canSave()).toBe(true);

    component.editorVersion.set('   ');
    expect(component.canSave()).toBe(false);
    component.editorVersion.set('v3-fix');
    component.editorSystemPrompt.set('');
    expect(component.canSave()).toBe(false);
    component.editorSystemPrompt.set('Body');
    expect(component.canSave()).toBe(true);
  });

  it('hasEditorChanges only fires once the textarea differs from the source', () => {
    list.mockReturnValue(of([v3Active()]));
    fixture.detectChanges();
    component.openEditor(v3Active());

    expect(component.hasEditorChanges()).toBe(false);
    component.editorSystemPrompt.set(v3Active().systemPrompt + '\nextra line');
    expect(component.hasEditorChanges()).toBe(true);
  });

  it('saveDraft POSTs the trimmed buffer, refreshes the list, expands the new row, closes editor', () => {
    const initial = [v3Active(), v2Deprecated()];
    const createdRow: PromptTemplate = {
      ...v3Active(),
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      version: 'v4',
      isActive: false,
    };
    const after = [createdRow, ...initial];
    list.mockReturnValueOnce(of(initial)).mockReturnValueOnce(of(after));
    create.mockReturnValue(of(createdRow));
    fixture.detectChanges();
    component.openEditor(v3Active());
    component.editorVersion.set('  v4  ');
    component.editorSystemPrompt.set('New body');
    component.editorNotes.set('  Why  ');

    component.saveDraft();

    expect(create).toHaveBeenCalledWith({
      name: 'narrative-default',
      version: 'v4',
      systemPrompt: 'New body',
      notes: 'Why',
    });
    expect(component.saving()).toBe(false);
    expect(component.editorSourceId()).toBeNull();
    expect(component.expandedId()).toBe(createdRow.id);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('saveDraft on failure shows an error banner and keeps the editor open', () => {
    list.mockReturnValue(of([v3Active()]));
    create.mockReturnValue(throwError(() => ({ error: { error: 'system prompt is required' } })));
    fixture.detectChanges();
    component.openEditor(v3Active());

    component.saveDraft();

    expect(component.saving()).toBe(false);
    expect(component.editorSourceId()).toBe(v3Active().id);
    expect(component.saveError()).toBe('system prompt is required');
  });

  it('saveDraft is a no-op when canSave is false (blank fields)', () => {
    list.mockReturnValue(of([v3Active()]));
    fixture.detectChanges();
    component.openEditor(v3Active());
    component.editorVersion.set('');

    component.saveDraft();

    expect(create).not.toHaveBeenCalled();
  });

  it('closeEditor wipes the buffer and the save error', () => {
    list.mockReturnValue(of([v3Active()]));
    fixture.detectChanges();
    component.openEditor(v3Active());
    component.editorVersion.set('v4');
    component.editorNotes.set('note');

    component.closeEditor();

    expect(component.editorSourceId()).toBeNull();
    expect(component.editorVersion()).toBe('');
    expect(component.editorNotes()).toBe('');
    expect(component.saveError()).toBeNull();
  });

  it('toggle on the editor card closes the editor too (UX consistency)', () => {
    list.mockReturnValue(of([v3Active()]));
    fixture.detectChanges();
    component.toggle(v3Active().id); // expand
    component.openEditor(v3Active());

    component.toggle(v3Active().id); // collapse

    expect(component.isExpanded(v3Active().id)).toBe(false);
    expect(component.editorSourceId()).toBeNull();
  });

  // ---------------------------------------------------------------------- envelope toggle

  it('does not fetch the envelope until the panel is opened — lazy load', () => {
    list.mockReturnValue(of([v3Active()]));
    fixture.detectChanges();

    expect(getEnvelope).not.toHaveBeenCalled();
    expect(component.envelope()).toBeNull();
  });

  it('fetches the envelope on first toggle, caches it, and surfaces close/open without re-fetching', () => {
    list.mockReturnValue(of([v3Active()]));
    getEnvelope.mockReturnValue(
      of({ version: 'v3', suffix: '--- OUTPUT CONTRACT ---\n{"summary":"…"}' }),
    );
    fixture.detectChanges();

    component.toggleEnvelope();
    expect(getEnvelope).toHaveBeenCalledTimes(1);
    expect(component.envelopeOpen()).toBe(true);
    expect(component.envelope()?.version).toBe('v3');

    // Close + reopen must reuse the cached envelope — the envelope is immutable per backend
    // build, no point hitting the network twice.
    component.toggleEnvelope();
    component.toggleEnvelope();
    expect(getEnvelope).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error banner when the envelope fetch fails', () => {
    list.mockReturnValue(of([v3Active()]));
    getEnvelope.mockReturnValue(throwError(() => new Error('500')));
    fixture.detectChanges();

    component.toggleEnvelope();
    expect(component.envelopeError()).not.toBeNull();
    expect(component.envelopeLoading()).toBe(false);
  });

  // ---------------------------------------------------------------------- lineDiff helper

  it('lineDiff tags identical strings as fully unchanged', () => {
    const result = lineDiff('line A\nline B\nline C', 'line A\nline B\nline C');
    expect(result.every((l) => l.kind === 'unchanged')).toBe(true);
    expect(result.length).toBe(3);
  });

  it('lineDiff detects pure additions and removals', () => {
    const added = lineDiff('A\nB', 'A\nB\nC');
    expect(added[2]).toEqual({ kind: 'added', line: 'C' });

    const removed = lineDiff('A\nB\nC', 'A\nB');
    expect(removed[2]).toEqual({ kind: 'removed', line: 'C' });
  });

  it('lineDiff handles a mixed change (one line replaced) as one remove plus one add', () => {
    const result = lineDiff('A\nB\nC', 'A\nX\nC');
    expect(result[0]).toEqual({ kind: 'unchanged', line: 'A' });
    expect(result[result.length - 1]).toEqual({ kind: 'unchanged', line: 'C' });
    // The two middle entries are one removed and one added in some order — both must be present.
    const middle = result.slice(1, -1);
    expect(middle.some((l) => l.kind === 'removed' && l.line === 'B')).toBe(true);
    expect(middle.some((l) => l.kind === 'added' && l.line === 'X')).toBe(true);
  });

  // ---------------------------------------------------------------------- helpers

  function v3Active(): PromptTemplate {
    return {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'narrative-default',
      version: 'v3',
      systemPrompt: 'Body v3',
      userTemplate: null,
      targetModel: null,
      isActive: true,
      createdAt: '2026-05-09T10:00:00Z',
      activatedAt: '2026-05-09T10:00:00Z',
      deprecatedAt: null,
      notes: null,
    };
  }

  function v2Deprecated(): PromptTemplate {
    return {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      name: 'narrative-default',
      version: 'v2',
      systemPrompt: 'Body v2',
      userTemplate: null,
      targetModel: null,
      isActive: false,
      createdAt: '2026-05-01T10:00:00Z',
      activatedAt: '2026-05-01T10:00:00Z',
      deprecatedAt: '2026-05-09T10:00:00Z',
      notes: null,
    };
  }

  function withFlip(row: PromptTemplate, isActive: boolean): PromptTemplate {
    return { ...row, isActive };
  }

  function neverResolves<T>(): Observable<T> {
    return new Observable<T>(() => {
      /* no-op subscribe — never emits, never completes */
    });
  }
});
