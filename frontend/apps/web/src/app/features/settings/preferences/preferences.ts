import { Component, inject } from '@angular/core';
import { MatButtonToggleChange } from '@angular/material/button-toggle';

import { TranslatePipe } from '@ngx-translate/core';
import { Language, LanguageService } from '../../../core/app-state/language.service';
import { Theme, ThemeService } from '../../../core/app-state/theme.service';
import { StbButtonToggleModule, StbIconModule } from '@portfolioai/ui';

/**
 * Settings → Preferences (USER + ADMIN accessible). Hosts the two app-wide knobs that used to
 * live in the toolbar : theme (dark / light) and language (fr / en). Persistence is delegated
 * to the underlying services — both write to `localStorage` and apply the change synchronously
 * (theme via `<html data-theme>`, language via `ngx-translate`'s `use()`).
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
