import { Injectable, effect, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type Language = 'fr' | 'en';

export const SUPPORTED_LANGUAGES: readonly Language[] = ['fr', 'en'];

/**
 * Unicode regional indicator emojis used to label languages in the UI. Choices :
 * - `fr` → 🇫🇷 (Hexagone, plus universel que 🇨🇦 même si la cible primaire est canadienne)
 * - `en` → 🇬🇧 (par convention pour l'anglais international ; 🇺🇸 reste lisible mais plus marqué)
 */
const LANGUAGE_FLAGS: Readonly<Record<Language, string>> = {
  fr: '🇫🇷',
  en: '🇬🇧',
};

const STORAGE_KEY = 'portfolioai.language';

/**
 * Signal-based wrapper around `ngx-translate` — same shape as `ThemeService` so the two are
 * symmetric in `App` (toggle from the toolbar, persist to localStorage, set the matching
 * `<html lang>` attribute for accessibility / browser-spell-check).
 *
 * The active language drives `TranslateService.use(...)` which loads `/i18n/<lang>.json` via the
 * HTTP loader configured in `app.config.ts`.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly _lang = signal<Language>(this.loadInitial());
  readonly lang = this._lang.asReadonly();
  readonly supported = SUPPORTED_LANGUAGES;

  constructor() {
    this.translate.addLangs([...SUPPORTED_LANGUAGES]);
    effect(() => {
      const l = this._lang();
      this.translate.use(l);
      try {
        document.documentElement.setAttribute('lang', l);
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        // ignore (private mode, SSR…)
      }
    });
  }

  set(lang: Language): void {
    this._lang.set(lang);
  }

  /** Quick toggle — useful for a 2-language app where a single button cycles through. */
  toggle(): void {
    this._lang.update((l) => (l === 'fr' ? 'en' : 'fr'));
  }

  /** Flag emoji for a language, suitable for inline display next to the name. */
  flag(lang: Language): string {
    return LANGUAGE_FLAGS[lang];
  }

  private loadInitial(): Language {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'fr' || saved === 'en') return saved;
    } catch {
      // ignore
    }
    // Browser locale fallback : `fr-CA` / `fr-FR` → `fr`. Anything else → `en`.
    const browser =
      typeof navigator !== 'undefined' && navigator.language
        ? navigator.language.toLowerCase()
        : 'en';
    return browser.startsWith('fr') ? 'fr' : 'en';
  }
}
