# Revue de code globale — 2026-05-02

**Scope** : audit complet de l'app à un instant donné — backend Kotlin/Spring (modules `market/`, `analysis/` Phase 1, `portfolio/`, `shared/`) + frontend Angular 21 (`core/`, `features/` actives, `app.config.ts`, i18n). Modules gelés Phase 0 (`analysis/` legacy, `ingestion/`, `features/recommendations/`, `features/history/`) hors scope sauf risque actif.

**Méthode** : revue par agent automatisé sur le checkout courant, avec brief explicite sur les conventions du projet (CLAUDE.md ground truth). Findings classés par sévérité, chacun avec référence `fichier:ligne`. Limité aux risques objectifs et aux violations de conventions stated, pas aux préférences de style.

**État du commit au moment de la revue** : working tree contenant i18n FR/EN complet, zoneless explicite, bumps deps front/back, fixes deprecation backend, bumps budgets — voir `etat-actuel.md` pour le détail.

---

## Résumé exécutif

App globalement saine et cohérente. Le pivot Phase 1 (`market/` + narratif LLM) est propre : indicateurs Kotlin pur unit-testés, LLM strictement rédacteur (prompt + validateur explicites), MockMarketChartClient bien pensé. Front : hexagonal léger uniforme sur les 5 ports, zoneless 100 % signal, i18n sérieusement appliquée.

**Principal risque identifié** : une **rupture de contrat HTTP** sur la preview CSV (front lit `bookValue/currency`, back envoie `bookValueCad/marketValue/marketCurrency`) — la prévisualisation affiche silencieusement vide. Plus deux risques opérationnels : `@EnableAsync` sans pool dédié, et `SnapshotController` en N+1. La couverture de tests est honnête sur les briques pures mais **`TickerNarrativeService` (la décision tree dedup/cache/kick) n'a aucun test** — logique chère en Claude API, à corriger en priorité.

---

## Critique

**1. Contrat preview CSV cassé**

- Back `CsvImportPreviewItem` (`backend/.../portfolio/application/dto/CsvImportDto.kt:5-14`) → `bookValueCad`, `marketValue`, `marketCurrency`
- Front `CsvImportPreviewItem` (`frontend/src/app/core/portfolio.repository.ts:38-46`) → `bookValue`, `currency`
- Template `csv-import.html:75-76` lit des champs qui n'existent pas dans la réponse → cellules vides en silence

→ Aligner le type front sur le DTO back.

**2. `CsvImportController` masque toutes les erreurs en 400 vide**

`backend/.../portfolio/infrastructure/http/CsvImportController.kt:21-33` — les `try { … } catch (e: Exception) { ResponseEntity.badRequest().build() }` court-circuitent `GlobalExceptionHandler`, body vide → message d'erreur front toujours générique même si la cause est DB / parsing différents.

→ Laisser remonter, ou retourner un payload avec le message d'erreur.

**3. `@Async` sans `ThreadPoolTaskExecutor`**

`BackendApplication.kt:8` active `@EnableAsync` sans bean ; Spring tombe sur `SimpleAsyncTaskExecutor` qui crée un thread par appel sans bornage. Sous protection de la dedup 5 min en pratique, mais clic-bombe sur 20 tickers = 20 threads bloqués 30-60 s sur Mistral.

→ Bean `ThreadPoolTaskExecutor` (par ex. core 2 / max 4 / queue 50).

---

## Important

**4. N+1 sur la timeline snapshots**

`SnapshotController.kt:18-31` — pour chaque snapshot un `findBySnapshotId` séparé. 30 imports × 4 comptes = 120 SQL pour afficher la liste. À regrouper en une `@Query` agrégée avec `count(p), sum(p.book_value_cad)`.

**5. `ClaudeClient` casts non-checked silencieux**

`ClaudeClient.kt:42-46` — `as Map<*, *>`, `as List<*>`, `as String`. Un payload Anthropic en mode safety-stop ou tool-use crashe en `ClassCastException` plutôt que message exploitable.

**6. Symboles non-normalisés côté market**

`MarketController.getTicker` n'uppercase pas, `TickerService.load` non plus. Cache Caffeine sensible à la casse : `aapl` et `AAPL` = 2 entrées + 2 hits Yahoo. Le snapshot DB est uppercase via `TickerNarrativeService`, donc dedup OK pour le narratif mais pas le fetch.

→ Normaliser en entrée du controller.

**7. `TickerNarrativeService.startAsync` — `get(job.id)!!` après `complete`**

`TickerNarrativeService.kt:50` — le `!!` masque un read concurrent avant flush JPA. Préférer un retour direct depuis `complete` ou un fallback explicite.

**8. `unrealizedGain!` × 4 dans le template dashboard**

`dashboard.html:148-153` — pattern dupliqué. `@let g = asset.unrealizedGain` ferait narrow correctement.

**9. `extractDateFromFilename` perd l'heure**

`CsvImportService.kt:367-375` — regex matche juste `YYYY-MM-DD`. WS exporte sans heure aujourd'hui, mais 2 imports le même jour → même `importedAt` à midi UTC, tri indéterministe.

**10. `csvImport` batch en récursion non-bornée**

`csv-import.ts:125-145` — `importNext()` enchaîne en récursion sur 50 fichiers. Le commentaire `// TODO` reconnaît la dette. `concat(...files.map(...))` plus propre.

**11. `pollNarrativeJob` — `throw` dans `takeWhile`**

`market.http.ts:55-61` — pattern dupliqué de `analysis.http.ts`. Ça marche mais un opérateur `timeout()` dédié serait plus idiomatique et testable.

---

## Nice-to-have

- `IndicatorCalculator.kt:91` — la branche "all gains, no losses → 100" mérite un test pinning explicite
- `TickerNarrativeRunner.kt:26` — `log.error("…", e)` au lieu de juste `e.message` pour garder la stack
- `pollNarrativeJob` ↔ `pollJob` — duplication quasi-identique, extractible en `pollUntilDone(url$, abortSeconds)` au prochain 3e poll
- `app.routes.ts` — lien "Recommandations IA" toujours dans la nav alors que la page est gelée Phase 0
- `IndicatorsDto` / `Indicators` boilerplate 1:1 (`TickerDto.kt:66-82`) — sérialiser le domain direct économiserait 16 lignes
- `csv-import.html:39` — `@let p = preview()!` avec `!` inutile, `@if (preview(); as p)` propre
- `LANGUAGE_FLAGS` — choix `🇬🇧` pour `en` peut surprendre un anglophone CA

---

## Test coverage — trous critiques

| Sujet | Pourquoi load-bearing |
|---|---|
| **`TickerNarrativeService.startAsync` (3 branches)** | Logique chère en Claude API. Bug "re-fire à chaque clic" silencieux financièrement |
| **`TickerNarrativeRunner.run`** | Branche `try/catch` du `@Async`, jamais exercée |
| **`YahooClient.fetchChart` chemins d'erreur** | Mapping 429 → 503 vs 404 → 404 détermine le UX. MockWebServer suffit |
| **`TickerService.load`** | Régression possible sur l'ordre `fetchChart → mappers → indicators` non détectée |
| **`TickerNarrativePersister`** (vrai PG) | JSONB via `JdbcTypeCode(SqlTypes.JSON)` notoirement fragile au boot |
| **`ClaudeClient`** | Aucun test — shape requête + response inattendu |

---

## Bilan

Codebase saine, conventions tenues (zoneless explicite, ports/adapters appliqués sans concession, i18n sérieuse, prompt versionné, snapshots append-only). Les 3 findings critiques sont locaux et **corrigibles en moins d'une demi-journée chacun**. Les manques de tests sur le cœur Phase 1 (narrative service + runner) sont la dette la plus structurante à régler avant que le pipeline ne grossisse en règles.

**Reco de priorisation** :

1. Contrat preview CSV (15 min)
2. Test `TickerNarrativeService` cache/dedup (45 min)
3. Pool `@Async` borné (10 min)
4. N+1 snapshots (30 min)
5. Le reste en cleanup commit dédié

---

## Suite donnée

Décision après lecture : **archivé**. À voir plus tard si on remonte des items vers `backlog.md` (section "Dette technique" ou Phase 2).
