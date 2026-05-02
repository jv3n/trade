# État actuel — 2026-05-02

Snapshot de la session pour reprendre proprement la prochaine fois. Le détail long vit dans `backlog.md` ; ce fichier ne note **que ce qui est en l'air maintenant**.

## Branche / tag

- Branche : `master`
- Dernier tag : `v0.1.0` — clôture de la **Phase 0**
- Derniers commits :
  - `feat(market): add Yahoo client, indicator calculator and ticker dossier endpoint`
  - `feat(market): add mock chart provider for local dev`
  - **À commit (cette session)** : pipeline narratif LLM par ticker — voir plus bas.

## Phase en cours

**Phase 1 — Pivot ticker** (cf. `metier/fonctionnalites.md`). LLM = rédacteur, pas décideur.

## Ce qui marche fin de session

### Backend market/ (déjà commit)
- `IndicatorCalculator` Kotlin pur, 20+ tests
- `YahooClient` + `YahooMappers` + `MockMarketChartClient` (déterministe par symbole)
- `MarketChartClient` interface + `@ConditionalOnProperty yahoo.provider`
- `MarketController` : `GET /api/market/ticker/{symbol}`

### Backend narratif (à commit)
- Migration Flyway `V2__ticker_narrative.sql` — tables `ticker_narrative_snapshot` (output, JSONB indicateurs + keyPoints) et `ticker_narrative_job` (état async)
- Domain : enum `Sentiment`, `TickerNarrativeJob`, `TickerNarrativeSnapshot`
- Application : `TickerNarrativeService` (dedup 5min + cache snapshot 30min) → `TickerNarrativeRunner` (`@Async`) → `TickerNarrativeExecutor` (parse + validate + 1 retry) → `TickerNarrativePersister`
- `TickerNarrativeParser` (tolère prose/fences/sentiment mixed-case) + `TickerNarrativeValidator` (3-5 keyPoints, ≤15 mots, summary 2-3 phrases)
- `LlmClient.modelId()` — provenance du modèle persistée sur chaque snapshot (`ollama:mistral`, `claude:claude-opus-4-6`)
- HTTP : `POST /narrative`, `GET /narrative/jobs/{id}`, `GET /narrative/latest`
- 17 tests unit (parser / validator / prompt)

**Validation end-to-end** (Ollama Mistral 7B, mock Yahoo) : POST → DONE en ~30-60 s, summary + sentiment BULLISH + 3 keyPoints + `modelUsed`. Re-POST < 30 min → cache hit immédiat, log `Reusing fresh snapshot`.

## Shelvé (pas dans le commit narratif)

- **Fix headers Yahoo** (`YahooClient.kt`) — Accept `*/*`, Accept-Language, Referer, Origin, Sec-Fetch-*, UA Chrome/134, log du body sur 429. Confirmé par curl que les headers passent (HTTP 200), mais Yahoo a un rate-limit IP **par-dessus** le filtre fingerprint qui se déclenche après quelques requêtes. Le code reste pertinent ; à reprendre quand on rallumera Yahoo en prod.

## Reprise possible — par ordre d'utilité

### Phase 1 reste à faire
A. **Front : section narratif sur la page ticker** — bouton "Générer/Régénérer", `MarketRepository.requestNarrative()` + `pollNarrative()` + `getLatestNarrative()`, sentiment chip + summary + bullets, état "en cours de génération". Le backend est prêt et validé.

B. **`TickerNarrativeServiceTest`** (intégration) — pipeline complet avec `MarketChartClient` + `LlmClient` stubbés : valide cache 30 min, dedup, retry validation. Pas critique mais utile pour les futurs refactors.

C. **Cleanup des jobs orphelins** (dette technique) — listener `ApplicationReadyEvent` qui passe les `PENDING` en `ERROR` au boot. ~15 min.

D. **Plan B Yahoo** (quand on rallume) — appliquer le shelve, logger les retries 429 avec backoff, ou bascule Twelve Data / Finnhub si l'IP-rate-limit reste un souci.

## À faire avant de commit la session
1. ✓ `./gradlew test` passe (tests narratif + suite complète).
2. ✓ Backend end-to-end validé (POST → poll → snapshot, cache hit confirmé).
3. ✓ Docs alignées (`backlog.md`, `architecture.md`, `CLAUDE.md`, ce fichier).
4. Commit narratif proposé : `feat(analysis): add async per-ticker LLM narrative pipeline`.
