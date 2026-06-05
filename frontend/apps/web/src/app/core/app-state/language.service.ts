import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
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
 *
 * **Side effects at the mutation site** — `translate.use(...)`, the `<html lang>` write and the
 * `localStorage` persist all live inside [set] (and via [toggle], which delegates to it) rather
 * than in an `effect()` watching the signal. Same rationale as `ThemeService` : the writes
 * happen exactly once per user action, there's no redundant initial echo of the freshly-loaded
 * value, the flow is testable without microtask awaiting, and `translate.use` runs on every
 * platform (it isn't a browser-only API) while `document` and `localStorage` are gated.
 *
 * **SSR safety** — `document`, `localStorage`, and `navigator` are browser-only. Each access is
 * gated on [isPlatformBrowser] so the server can instantiate the service without throwing ;
 * mirror of the same pattern in [ThemeService].
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly translate = inject(TranslateService);
  private readonly _lang = signal<Language>(this.loadInitial());
  readonly lang = this._lang.asReadonly();
  readonly supported = SUPPORTED_LANGUAGES;

  constructor() {
    this.translate.addLangs([...SUPPORTED_LANGUAGES]);
    // Initial framework sync — `translate.use(...)` must reflect the loaded language at boot
    // before any user action. No localStorage write : the value already came from there.
    this.apply(this._lang(), /* persist */ false);
  }

  set(lang: Language): void {
    this._lang.set(lang);
    this.apply(lang, /* persist */ true);
  }

  /** Quick toggle — useful for a 2-language app where a single button cycles through. */
  toggle(): void {
    this.set(this._lang() === 'fr' ? 'en' : 'fr');
  }

  private apply(lang: Language, persist: boolean): void {
    this.translate.use(lang);
    if (!this.isBrowser) return;
    try {
      document.documentElement.setAttribute('lang', lang);
      if (persist) localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // localStorage unavailable (private mode, quota exceeded); silently ignore
    }
  }

  /** Flag emoji for a language, suitable for inline display next to the name. */
  flag(lang: Language): string {
    return LANGUAGE_FLAGS[lang];
  }

  private loadInitial(): Language {
    if (!this.isBrowser) return 'fr';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'fr' || saved === 'en') return saved;
    } catch {
      // ignore
    }
    // Browser locale fallback : `fr-CA` / `fr-FR` → `fr`. Anything else → `en`.
    const browser = navigator.language ? navigator.language.toLowerCase() : 'en';
    return browser.startsWith('fr') ? 'fr' : 'en';
  }
}
