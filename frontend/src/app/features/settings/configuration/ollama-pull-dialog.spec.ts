/**
 * Tests on [OllamaPullDialog] — pin the modal contract that wraps a backend pull. The dialog
 * blocks the user during 1-3 min of download, so the failure modes that matter are :
 *
 * - **Suggestion click** populates the input without bypassing the form validation (still
 *   requires a non-empty value to enable Pull).
 * - **Pull success** closes the dialog with the typed model tag — the parent panel's signal
 *   already reflects the post-action snapshot via the shared service, so the close payload
 *   is for diagnostics rather than rendering.
 * - **Pull failure** keeps the dialog open with an inline error so the user can correct a
 *   typo without losing form state. Both failure paths covered : a thrown HTTP error and a
 *   200 response carrying `daemonReachable: false` (the backend's fail-soft contract turns
 *   most upstream errors into the latter).
 * - **Busy state** : while the pull is in flight, buttons are disabled, the spinner row is
 *   visible, and clicking the input or suggestions is a no-op (avoids a second concurrent
 *   pull while waiting).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { provideTranslateService } from '@ngx-translate/core';
import { OllamaStatus } from '../../../core/ollama-status.repository';
import { OllamaStatusService } from '../../../core/ollama-status.service';
import { OllamaPullDialog } from './ollama-pull-dialog';

describe('OllamaPullDialog', () => {
  let fixture: ComponentFixture<OllamaPullDialog>;
  let component: OllamaPullDialog;
  const pull = vi.fn();
  const deleteFn = vi.fn();
  const dialogClose = vi.fn();
  // The dialog reads the panel's polled snapshot to flag suggestions that are already pulled
  // and to surface other-pulled models. Driven directly via this signal in tests.
  const statusSignal = signal<OllamaStatus | null>(null);

  const reachableSnap: OllamaStatus = {
    daemonReachable: true,
    baseUrl: 'http://localhost:11434',
    latencyMs: 14,
    loadedModels: [],
    availableModels: ['mistral:7b', 'qwen2.5:3b'],
    errorMessage: null,
  };

  beforeEach(async () => {
    pull.mockReset();
    deleteFn.mockReset();
    dialogClose.mockReset();
    statusSignal.set(null);

    await TestBed.configureTestingModule({
      imports: [OllamaPullDialog],
      providers: [
        provideTranslateService({ lang: 'en' }),
        {
          provide: OllamaStatusService,
          useValue: { pull, delete: deleteFn, status: statusSignal.asReadonly() },
        },
        { provide: MatDialogRef, useValue: { close: dialogClose } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OllamaPullDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('selects a suggestion into the model input', () => {
    component.selectSuggestion('mistral:7b');
    expect(component.modelControl.value).toBe('mistral:7b');
  });

  it('pull closes the dialog with the typed model on success', async () => {
    pull.mockResolvedValue(reachableSnap);
    component.modelControl.setValue('mistral:7b');

    await component.pull();

    expect(pull).toHaveBeenCalledWith('mistral:7b');
    expect(dialogClose).toHaveBeenCalledWith('mistral:7b');
    expect(component.busy()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('pull trims surrounding whitespace before forwarding the model name', async () => {
    pull.mockResolvedValue(reachableSnap);
    component.modelControl.setValue('  mistral:7b  ');

    await component.pull();

    expect(pull).toHaveBeenCalledWith('mistral:7b');
    expect(dialogClose).toHaveBeenCalledWith('mistral:7b');
  });

  it('pull short-circuits when the input is empty', async () => {
    component.modelControl.setValue('   '); // whitespace only

    await component.pull();

    // No HTTP call, no dialog close — the form's required validator is what guards the button
    // in the template, but the method-level check is a defense in depth.
    expect(pull).not.toHaveBeenCalled();
    expect(dialogClose).not.toHaveBeenCalled();
  });

  it('pull keeps the dialog open with an inline error when the service rejects', async () => {
    pull.mockRejectedValue(new Error('registry unreachable'));
    component.modelControl.setValue('mistral:7b');

    await component.pull();

    expect(dialogClose).not.toHaveBeenCalled();
    expect(component.error()).toBe('registry unreachable');
    expect(component.busy()).toBe(false);
  });

  it('pull keeps the dialog open when the snapshot reports daemon unreachable', async () => {
    // The backend's fail-soft contract turns most upstream errors (wrong model tag, registry
    // 5xx, network) into a 200 response carrying `daemonReachable: false`. The dialog must
    // treat that as a user-visible failure rather than a success.
    pull.mockResolvedValue({
      ...reachableSnap,
      daemonReachable: false,
      errorMessage: 'HTTP 500 from Ollama',
    } satisfies OllamaStatus);
    component.modelControl.setValue('definitely-not-a-real-model');

    await component.pull();

    expect(dialogClose).not.toHaveBeenCalled();
    expect(component.error()).toBe('HTTP 500 from Ollama');
    expect(component.busy()).toBe(false);
  });

  it('cancel closes the dialog with null when not busy', () => {
    component.cancel();
    expect(dialogClose).toHaveBeenCalledWith(null);
  });

  it('cancel is a no-op while a pull is in flight', () => {
    // Simulate the busy phase — the user shouldn't be able to bail mid-download since Ollama
    // doesn't support a clean abort. The cancel button is disabled in the template, this test
    // pins the same guard at the method level.
    component.busy.set(true);
    component.cancel();
    expect(dialogClose).not.toHaveBeenCalled();
  });

  it('flags suggestions that are already pulled locally', () => {
    statusSignal.set(reachableSnap); // available: mistral:7b + qwen2.5:3b
    fixture.detectChanges();

    // `mistral:7b` and `qwen2.5:3b` are in suggestions AND in availableModels — flagged.
    expect(component.isPulled('mistral:7b')).toBe(true);
    expect(component.isPulled('qwen2.5:3b')).toBe(true);
    // `phi4-mini` is in suggestions but NOT in availableModels — not flagged.
    expect(component.isPulled('phi4-mini')).toBe(false);
  });

  it('lists models pulled locally that are not in the hardcoded suggestions', () => {
    // Typical case : the user pulled `gemma2:9b` by hand from the terminal and it should be
    // discoverable + clickable from the dialog without a dropdown that only knows about the
    // 6 baked-in suggestions.
    statusSignal.set({
      ...reachableSnap,
      availableModels: ['gemma2:9b', 'qwen2.5:3b', 'custom-finetune:latest'],
    });
    fixture.detectChanges();

    // qwen2.5:3b is filtered out (it's already in the suggestions list) ; the two others remain.
    expect(component.otherPulled()).toEqual(['gemma2:9b', 'custom-finetune:latest']);
  });

  it('renders nothing in the other-pulled section when every available model is already a suggestion', () => {
    statusSignal.set({ ...reachableSnap, availableModels: ['qwen2.5:3b', 'mistral:7b'] });
    fixture.detectChanges();

    // Both available models are in suggestions — section stays hidden.
    expect(component.otherPulled()).toEqual([]);
    expect(fixture.nativeElement.querySelector('[data-testid="other-pulled"]')).toBeFalsy();
  });

  it('delete forwards the model name to the service and clears any prior inline error', async () => {
    deleteFn.mockResolvedValue(undefined);
    component.error.set('previous error'); // residue from a prior failed pull
    statusSignal.set(reachableSnap); // mistral:7b + qwen2.5:3b pulled

    await component.delete('mistral:7b');

    expect(deleteFn).toHaveBeenCalledWith('mistral:7b');
    expect(component.error()).toBeNull();
  });

  it('delete is a no-op while a pull is in flight', async () => {
    // Defense in depth — the trash button is disabled in the template, but the method-level
    // guard catches a programmatic call (and protects against a race where the disabled
    // attribute didn't propagate yet).
    component.busy.set(true);

    await component.delete('mistral:7b');

    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('delete renders an inline error when the service rejects', async () => {
    deleteFn.mockRejectedValue(new Error('disk locked'));

    await component.delete('mistral:7b');

    expect(component.error()).toBe('disk locked');
  });
});
