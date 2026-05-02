# État actuel — 2026-05-02

Snapshot de la session pour reprendre proprement la prochaine fois. Le détail long vit dans `backlog.md` ; ce fichier ne note **que ce qui est en l'air maintenant**.

## Branche / tag

- Branche : `master`
- Dernier tag : `v0.1.0` — clôture de la **Phase 0**
- Plusieurs commits déjà passés cette session : Yahoo client, mock provider, pipeline narratif LLM, tests-as-doc, fix CSV date timezone, onboarding doc, dashboard total agrégé, narratif front complet.

## Phase en cours

**Phase 1 — Pivot ticker** (cf. `metier/fonctionnalites.md`). LLM = rédacteur, pas décideur.

**État Phase 1** : critique livré 100 % côté backend ET frontend. Reste 🟡 `TickerNarrativeServiceTest` d'intégration et 🟡 liste cliquable des tickers, plus 🟢 sur Settings et tests Yahoo HTTP.

## Ce qui est en working tree (à commit)

Multiples concerns regroupables en 1 commit chore (ou 2 si on veut séparer infra) :

### Frontend — i18n FR/EN

- `@ngx-translate/core` + `@ngx-translate/http-loader` v17 ajoutés
- `LanguageService` (signal + localStorage + fallback navigateur), miroir de `ThemeService`
- `provideTranslateService` + `provideTranslateHttpLoader` dans `app.config.ts`
- `public/i18n/fr.json` + `en.json` (~170 clés organisées : common, nav, header, dashboard, ticker, csvImport, suivi, history, settings/sourcesPage/testPage/previewPage, categories, statuses, sentiment)
- Header : bouton drapeau (mat-menu) avec FR / EN, drapeau actif + check, persistance localStorage
- Toutes les pages migrées : strings hard-codées remplacées par `'key' | translate` ou `TranslateService.instant('key')` pour les erreurs dynamiques
- Composants importent `TranslatePipe` (granulaire) et non `TranslateModule`
- Tests : `provideTranslateService({ lang: 'en' })` ajouté à 8 TestBed, 2 assertions ajustées pour vérifier la clé i18n au lieu du texte FR

### Frontend — zoneless explicite

- `provideZonelessChangeDetection()` ajouté dans `app.config.ts` (la conf est lisible plutôt que devinée)
- `OnPush` retiré de `TickerPage` (le seul qui l'avait) — en zoneless+signals, Default suffit

### Frontend — bumps deps + budgets

- `npm update` : Angular 21.2.7-9 → 21.2.11, vitest 4.1.4 → 4.1.5
- `package.json` normalisé : tous les `^` à `^major.0.0`, TypeScript reste en `~5.9.0` (Angular casse entre minors TS)
- `angular.json` : budgets `initial` 500kB/1MB → 1MB/2MB, `anyComponentStyle` 16/32 → 24/48 kB

### Backend — bumps deps + fixes deprecation

- Spring Boot 3.5.0 → **3.5.14** (cascade postgres/jackson/caffeine via BOM)
- Kotlin 2.1.20 → **2.1.21** (3 plugins)
- ktfmt 0.54 → **0.55** (0.62 attendait Kotlin 2.2+)
- commons-csv 1.12.0 → **1.14.1**
- Fix deprecation `URL(String)` → `URI(url).toURL()` dans `RssFetcherService`
- Fix deprecation `CSVFormat.Builder.build()` → `.get()` dans `CsvImportService`

### Docs

- `CLAUDE.md` : conventions zoneless + i18n + 5 repositories + structure tests avec `provideTranslateService`
- `architecture.md` : décisions techniques "Zoneless explicite" + "i18n runtime via ngx-translate", module `core/` enrichi (5 repos + theme + language services)
- `developpement.md` : structure frontend mise à jour avec `public/i18n/` + `language.service.ts`
- `developper.md` : section "Switcher la langue" ajoutée dans le walkthrough

## Reprise possible — par ordre d'utilité

### Phase 1 reste à faire (cf. `backlog.md`)

A. **`TickerNarrativeServiceTest`** (intégration) — pipeline complet avec `MarketChartClient` + `LlmClient` stubbés : valide cache 30 min, dedup, retry validation. ~30 min.

B. **Liste cliquable des tickers détenus** sur le dashboard — petite UX win, ~20 min.

C. **Cleanup des jobs orphelins** au boot (dette technique) — listener `ApplicationReadyEvent`. ~15 min.

D. **Settings adaptés Phase 1** — test source Yahoo + prompt-preview par ticker. 🟢 basse priorité.

E. **Plan B Yahoo** — réappliquer le shelve headers + retry/backoff, ou bascule Twelve Data / Finnhub si IP-rate-limit persiste.

## Shelvé

- **Fix headers Yahoo** — non commité, à reprendre quand on rallumera Yahoo en prod (cf. piste E).
