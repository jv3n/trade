import { Component, computed, inject } from '@angular/core';
import { MatButtonToggleChange } from '@angular/material/button-toggle';
import { Router } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import { StbButtonModule, StbButtonToggleModule, StbIconModule } from '@portfolioai/ui';
import { AuthService } from '../../../core/app-state/auth.service';
import {
  BalanceCurrency,
  BalanceCurrencyService,
} from '../../../core/app-state/balance-currency.service';
import { Language, LanguageService } from '../../../core/app-state/language.service';
import { Theme, ThemeService } from '../../../core/app-state/theme.service';

/** The three theme choices, in the order the mockup lays them out. */
const THEMES: readonly Theme[] = ['system', 'dark', 'light'];

/** Material Symbols name per theme — `contrast` reads as "whatever the system says". */
const THEME_ICONS: Readonly<Record<Theme, string>> = {
  system: 'contrast',
  dark: 'dark_mode',
  light: 'light_mode',
};

/**
 * Settings › Preferences — the only section every user reaches. Hosts the profile (with the sign
 * out, which has nowhere else to live since the avatar menu lost its entries) and the three
 * app-wide knobs : theme, language and the balance display currency.
 *
 * All three persist **on the user** (`PUT /api/me/preferences`), so the choice follows the account
 * across devices, and each applies reactively off the refreshed `AuthService.currentUser` : the
 * theme through `<html data-theme>`, the language through `ngx-translate`'s `use()`, the currency
 * through the account page's hero.
 */
@Component({
  selector: 'app-preferences',
  imports: [StbButtonModule, StbButtonToggleModule, StbIconModule, TranslatePipe],
  templateUrl: './preferences.html',
  styleUrl: './preferences.scss',
})
export class PreferencesPage {
  readonly theme = inject(ThemeService);
  readonly language = inject(LanguageService);
  readonly balanceCurrency = inject(BalanceCurrencyService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly themes = THEMES;
  readonly themeIcons = THEME_ICONS;

  /** Two letters for the avatar — the display name's initials, or the email's first letter. */
  readonly initials = computed(() => {
    const user = this.auth.currentUser();
    const source = user?.displayName?.trim() || user?.email || '';
    const words = source.split(/[\s.@]+/).filter(Boolean);
    return words
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  });

  setTheme(event: MatButtonToggleChange): void {
    this.theme.set(event.value as Theme);
  }

  setLanguage(event: MatButtonToggleChange): void {
    this.language.set(event.value as Language);
  }

  setCurrency(event: MatButtonToggleChange): void {
    this.balanceCurrency.set(event.value as BalanceCurrency);
  }

  /** Same contract as the shell's : land on `/login` whatever the backend answers. */
  signOut(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login']),
    });
  }
}
