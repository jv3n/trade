/**
 * Tests on [unsavedChangesGuard] — the canDeactivate function that stops a nav click from dropping
 * a trade's unsaved edits (#303, hit twice in the pilot test : the post-mortem « did not save »).
 *
 * - A page with nothing unsaved leaves at once, without opening the modal.
 * - A page with unsaved edits asks through [ConfirmService], and leaves only on confirm.
 */
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, isObservable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmService } from '../app-state/confirm.service';
import { HasUnsavedChanges, unsavedChangesGuard } from './unsaved-changes.guard';

const unused = undefined as never;

function run(dirty: boolean, answer = true) {
  const ask = vi.fn(() => of(answer));
  TestBed.configureTestingModule({ providers: [{ provide: ConfirmService, useValue: { ask } }] });
  const page: HasUnsavedChanges = { hasUnsavedChanges: () => dirty };
  const result = TestBed.runInInjectionContext(() =>
    unsavedChangesGuard(page, unused, unused, unused),
  );
  return { result, ask };
}

async function resolve(result: unknown): Promise<unknown> {
  return isObservable(result) ? firstValueFrom(result as Observable<unknown>) : result;
}

describe('unsavedChangesGuard', () => {
  it('lets a page with nothing unsaved go without asking', async () => {
    const { result, ask } = run(false);

    expect(await resolve(result)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks before leaving unsaved edits, as a destructive action', async () => {
    const { result, ask } = run(true);

    expect(await resolve(result)).toBe(true);
    expect(ask).toHaveBeenCalledWith('common.confirmLeave', { variant: 'danger' });
  });

  it('stays on the page when the modal is cancelled', async () => {
    const { result } = run(true, false);

    expect(await resolve(result)).toBe(false);
  });
});
