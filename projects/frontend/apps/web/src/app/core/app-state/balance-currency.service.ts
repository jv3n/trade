import { Injectable, computed, inject } from '@angular/core';
import { BalanceCurrency } from '../api/auth/auth.repository';
import { AuthService } from './auth.service';

export type { BalanceCurrency };

export const SUPPORTED_CURRENCIES: readonly BalanceCurrency[] = ['USD', 'CAD'];

const DEFAULT_CURRENCY: BalanceCurrency = 'USD';

/**
 * Display currency of the account balance — **persisted on the user** (#201), symmetric with
 * `ThemeService` / `LanguageService`. It used to be a toggle living in the account page's memory,
 * reset on every visit ; a Canadian trader reading their balance in CAD shouldn't have to say so
 * again each morning.
 *
 * The account itself stays **USD-denominated** : movements, summary and chart are USD, and CAD is
 * a conversion of the displayed balance at the day's ECB rate (see `ForexRepository`). Nothing is
 * stored in CAD.
 */
@Injectable({ providedIn: 'root' })
export class BalanceCurrencyService {
  private readonly auth = inject(AuthService);

  readonly supported = SUPPORTED_CURRENCIES;

  /** The user's preference, or USD when there is no user yet (boot, login page). */
  readonly currency = computed<BalanceCurrency>(
    () => this.auth.currentUser()?.balanceCurrency ?? DEFAULT_CURRENCY,
  );

  /** Persists the choice ; [currency] re-drives once `currentUser` updates. */
  set(currency: BalanceCurrency): void {
    this.auth.updatePreferences({ balanceCurrency: currency }).subscribe();
  }
}
