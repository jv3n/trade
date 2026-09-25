import { Injectable, signal } from '@angular/core';

/**
 * Wording of [StbFormFieldReset]. The lib has no i18n : the English default below is what ships,
 * and the app overwrites it with its own translation (`app.config.ts`).
 *
 * A signal rather than a plain string — the translation files load asynchronously, so the label
 * usually lands after the first fields are already on screen.
 */
@Injectable({ providedIn: 'root' })
export class StbFormFieldResetIntl {
  /** Tooltip and accessible name of the reset button. */
  readonly resetField = signal('Reset field');
}
