import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { StbToast } from '@portfolioai/ui';
import { Language } from '../api/auth/auth.repository';
import { AuthService } from './auth.service';

export type { Language };

export const SUPPORTED_LANGUAGES: readonly Language[] = ['fr', 'en'];

/**
 * Flags labelling the languages in the UI : 🇫🇷 reads more universally than 🇨🇦 even though the
 * user is Canadian, and 🇬🇧 is the convention for international English.
 */
const LANGUAGE_FLAGS: Readonly<Record<Language, string>> = {
  fr: '🇫🇷',
  en: '🇬🇧',
};

/**
 * Active language — now **persisted on the user**, not in localStorage. Symmetric with
 * `ThemeService` : the applied value is derived from [AuthService.currentUser] (the `language` field
 * served by `/api/me`), falling back to the browser locale (then `'fr'`) when there is no user yet
 * (boot, login page). [set] writes the choice through `PUT /api/me/preferences` ; the resulting
 * `currentUser` update re-drives [lang] + the apply effect.
 *
 * The active language drives `TranslateService.use(...)` which loads `/i18n/<lang>.json`, and is
 * mirrored onto `<html lang>` for accessibility / browser spell-check. Applied once at construction
 * (before first paint) and via an `effect()` on every subsequent change.
 *
 * **SSR safety** — `document` / `navigator` are browser-only and gated on [isPlatformBrowser] ;
 * `translate.use` runs on every platform.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(StbToast);
  readonly supported = SUPPORTED_LANGUAGES;

  /** Resolved language : the user's preference, else the browser locale, else `'fr'`. */
  readonly lang = computed<Language>(
    () => this.auth.currentUser()?.language ?? this.browserDefault(),
  );

  constructor() {
    this.translate.addLangs([...SUPPORTED_LANGUAGES]);
    this.apply(this.lang());
    effect(() => this.apply(this.lang()));
  }

  /**
   * Persists the choice on the user ; [lang] + the effect re-apply once `currentUser` updates.
   *
   * Then **reloads** : `LOCALE_ID` is resolved once at start-up (#311), so the pipes already
   * rendered would keep the old separator and date format. Reloading is the honest way to keep the
   * whole page in one language — and this is a settings-page action, not something done mid-flow.
   */
  set(lang: Language): void {
    if (lang === this.lang()) return;
    this.auth.updatePreferences({ language: lang }).subscribe({
      next: () => {
        if (this.isBrowser) location.reload();
      },
      // Without the reload nothing at all moves on screen, so a silent failure would read as a
      // dead button : say it rather than leave the click unanswered.
      error: () => this.toasts.error(this.translate.instant('language.saveError')),
    });
  }

  /** Quick toggle — useful for a 2-language app where a single button cycles through. */
  toggle(): void {
    this.set(this.lang() === 'fr' ? 'en' : 'fr');
  }

  /** Flag emoji for a language, suitable for inline display next to the name. */
  flag(lang: Language): string {
    return LANGUAGE_FLAGS[lang];
  }

  private apply(lang: Language): void {
    this.translate.use(lang);
    if (this.isBrowser) document.documentElement.setAttribute('lang', lang);
  }

  /** Browser locale fallback for the unauthenticated case : `fr-*` → `fr`, anything else → `en`. */
  private browserDefault(): Language {
    if (!this.isBrowser) return 'fr';
    const browser = navigator.language ? navigator.language.toLowerCase() : 'en';
    return browser.startsWith('fr') ? 'fr' : 'en';
  }
}
