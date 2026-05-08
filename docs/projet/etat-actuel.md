# État actuel — Phase 2.5 en cours (2026-05-07)

Snapshot de fin de session du 2026-05-07. La Phase 2 est clôturée (`v0.3.0`, 2026-05-06). La **Phase 2.5 — Stabilisation et outils** avance bien : la moitié des items est livrée, il reste 3 petites tâches que la prochaine session veut tuer **avant** d'attaquer la grosse epic DAG (Phase 4 : pipeline d'analyse — modèle DAG unifié).

Pour le journal narratif détaillé phase par phase, voir [`journal-livraisons.md`](./journal-livraisons.md). Pour ce qui reste ouvert, voir [`backlog.md`](./backlog.md).

## Branches / tags

- Branche : `master` (working tree clean en fin de session, voir `git status`)
- Derniers tags :
  - `v0.1.0` — clôture **Phase 0** (recommandations RSS, **décommissionnée** en Phase 2.5 / migration V6)
  - `v0.2.0` — clôture **Phase 1 — Pivot ticker**
  - `v0.3.0` — clôture **Phase 2 — Profondeur ticker**
- Pas encore de tag Phase 2.5 — la phase n'est pas finie.

## Ce qui a bougé depuis la clôture Phase 2 (2026-05-06)

Liste compacte ; détail dans le journal.

- ✅ **Décommissionnement Phase 0** en 3 PR séquentielles : migration Flyway V6 drop `recommendation*` + `analysis_job` + `feed_*`, modules `ingestion/` + 16 fichiers `analysis/` legacy supprimés, frontend `recommendations/` + `history/` + `settings/sources/` + `settings/test-sources/` supprimés, doc-set sync. `OrphanedJobCleanupListener` ne sweep plus que `ticker_narrative_job`.
- ✅ **Config runtime v2** (v1 + v1.5) : `llm.provider` (claude/ollama), `ollama.model`, `anthropic.api.model`, `llm.timeout-seconds` (60..900) éditables au runtime. `RoutingLlmClient` `@Primary` qui délègue per-call. `LlmTimeoutService` côté front primé via `provideAppInitializer`. Sub-sidenav `Providers / LLM` sur `/settings/configuration`.
- ✅ **Type d'instrument — chip 3/3** : header dossier ticker (phase 1), watchlist sidebar (phase 3, lazy lookup `getTicker` pour réutiliser le cache 15 min), tickers détenus sidebar (phase 2, extension query JPQL `OwnedTicker.assetType`). 7 variantes (STOCK/ETF/INDEX/OTHER + CRYPTO/BOND/COMMODITY).
- ✅ **`CacheTtlListener` AFTER_COMMIT** : passage `@EventListener` → `@TransactionalEventListener(AFTER_COMMIT)`, ferme finding #5 audit 2026-05-06. 3 tests `@SpringBootTest` qui pin commit / rollback / autre clé.
- ✅ **CSV demo multi-types** : `holdings-report-2026-05-07-all-types.csv` (15 positions, tous les `AssetType` : STOCK / ETF / CRYPTO / BOND / COMMODITY) ajouté à `docs/data-input/`.
- ✅ **Split `backlog.md` ↔ `journal-livraisons.md`** : nouveau fichier journal reverse-chronological par phase (toutes les ✅ migrées avec leurs notes intactes), `backlog.md` rétréci 233 → 125 lignes — ne garde que `⏳`/`🚧`/`🧊`/`❌` + Dette technique.

## Reprise demain — 3 petites tâches Phase 2.5 avant le DAG

L'idée de la prochaine session : **tuer ce qui peut l'être en une demi-journée** pour arriver le plus léger possible sur la grosse epic DAG.

### Cible immédiate (par ordre d'attaque suggéré)

1. **🟡 Clé Claude SECRET runtime** (~1 h) — le plus rapide, gros recopiage du pattern `market.twelvedata.api-key` / `market.finnhub.api-key`. Backend : `ANTHROPIC_API_KEY` ajouté à `ConfigKeys` + `SECRET_KEYS` + `KNOWN_KEYS` ; `ClaudeClient` + `ConfigTestClient` switchent du `@Value` figé à `appConfig.getString(...)` per-call. Frontend : nouvelle card `<section class="config-card">` dans `/settings/configuration > LLM` modelée sur la card Twelve Data (password input + boutons Sauvegarder + Effacer + Tester). Tests : `AppConfigServiceTest` + `ConfigControllerTest` (count 12 clés) + `configuration.spec.ts` extended. i18n FR + EN.
2. **🟡 Panneau État Ollama** sur `/settings/configuration > LLM` (~2 h) — surface daemon up/down + modèle chargé + countdown idle + modèles pull localement. Backend : 2 endpoints proxy (`GET /api/config/llm/status` + `POST /probe`) qui appellent `/api/tags` et `/api/ps`. Frontend : `OllamaStatusService` (mirror `LlmTimeoutService`) signal-based + `OllamaStatusPanel` standalone. Conditionnel `llm.provider === 'ollama'`, message « non applicable » sinon.
3. **🟡 Swagger / OpenAPI** (~2 h) — ajouter `springdoc-openapi-starter-webmvc-ui` à `backend/build.gradle.kts`, `/swagger-ui.html` activé via `application-local.yml` (option Tilt-only standalone retenue v1). Annotations légères `@Tag(name = …)` par controller, pas de `@Operation`/`@Schema` exhaustives — l'auto-gen Kotlin suffit pour démarrer.

Total estimé ~5 h, soit une demi-journée propre.

### Pourquoi pas le SSE (prérequis DAG)

Le ticket **Push SSE per-phase** est lui aussi en `⏳ 🟡 Moyenne` (~1 j) mais il est explicitement filed comme **prérequis structurel du DAG** dans le backlog. L'attaquer en isolation aujourd'hui = refactor le canal de transport sans encore avoir le modèle de jobs cible — risque de retoucher deux fois. → garder le SSE **dans la même session que le démarrage du DAG**, pas avant.

### Ce qui peut attendre l'après-DAG

- 🟢 Décision design Ollama deployment (juste à arbitrer en session courte ; pas de code)
- 🟢 Drag-drop portfolios sidebar
- 🟢 Sidebar modulaire détachable

## Pour la session de demain — checklist d'entrée

1. `git pull` puis `git status` — confirmer working tree clean.
2. Ouvrir `backlog.md > Phase 2.5 > À faire` — lire les 3 tickets cible (clé Claude / État Ollama / Swagger).
3. Décider l'ordre d'attaque (le plus simple en premier garde l'élan).
4. Pour chaque ticket : lire en parallèle l'entrée correspondante dans `journal-livraisons.md > Phase 2.5` du **prédécesseur le plus proche** (la card Twelve Data pour la clé Claude, la card LLM provider pour État Ollama) — copier le pattern, pas réinventer.
5. Une PR par ticket : commit message conventionnel + journal-livraisons.md mis à jour + backlog.md ⏳ retiré.

## Reste de Phase 2.5 (référence)

- 🟡 Push SSE per-phase — à grouper avec le démarrage DAG (cf. ci-dessus)
- 🟢 3 items de polish UX dashboard (drag-drop portfolios, sidebar modulaire)
- 🟢 1 décision design Ollama deployment

## Phase 4 — Vision long terme

Premier ticket d'attaque post-Phase-2.5 : **Pipeline d'analyse — modèle DAG unifié** (`docs/metier/vision.md > Le pipeline d'analyse`, `docs/technique/architecture.md > Modèle pipeline d'analyse`). ~3 jours d'effort selon le ticket fondateur. Prérequis pour : Page Jobs (Phase 3) + Réintégration Phase 0 (Phase 4) + Cron quotidien pré-chauffe (Phase 4). Le SSE per-phase et le DAG seront probablement co-livrés dans la même session.
