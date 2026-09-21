import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ConfirmService } from '../app-state/confirm.service';

/** A page holding an edit buffer the user could lose by navigating away. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Asks before leaving a page whose edits are not saved (#303) — through the app's confirmation
 * modal, so a nav click never drops a half-written post-mortem. Tab close and reload are the
 * page's own `beforeunload`, which the router never sees.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (page) =>
  !page.hasUnsavedChanges() ||
  inject(ConfirmService).ask('common.confirmLeave', { variant: 'danger' });
