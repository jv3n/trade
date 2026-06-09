import { Component, inject } from '@angular/core';
import { MatButtonToggleChange } from '@angular/material/button-toggle';

import { TranslatePipe } from '@ngx-translate/core';
import { StbButtonToggleModule, StbIconModule } from '@portfolioai/ui';
import { Language, LanguageService } from '../../../core/app-state/language.service';
import { Theme, ThemeService } from '../../../core/app-state/theme.service';

/**
 * Settings → Preferences (USER + ADMIN accessible). Hosts the two app-wide knobs : theme
 * (dark / light) and language (fr / en). Persistence is delegated to the underlying services —
 * both now persist **on the user** (`PUT /api/me/preferences`, so the choice follows the account
 * across devices) and apply the change reactively (theme via `<html data-theme>`, language via
 * `ngx-translate`'s `use()`) off the refreshed `AuthService.currentUser`.
 */
@Component({
  selector: 'app-preferences',
  imports: [StbButtonToggleModule, StbIconModule, TranslatePipe],
  templateUrl: './preferences.html',
  styleUrl: './preferences.scss',
})
export class PreferencesPage {
  readonly theme = inject(ThemeService);
  readonly language = inject(LanguageService);

  setTheme(event: MatButtonToggleChange): void {
    this.theme.set(event.value as Theme);
  }

  setLanguage(event: MatButtonToggleChange): void {
    this.language.set(event.value as Language);
  }
}
