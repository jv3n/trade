# Revue de code globale — repo complet (2026-06-15)

**Scope** : audit global du codebase à `HEAD` (`125d611`), périmètre **tout le repo** (live post-pivot + dormant pré-pivot), demandé hors contexte d'un delta de feature. Le working tree porte des modifications **docs-only** de la session du jour (US compte-broker, maquette, passe doc-maintainer) — aucun changement de code applicatif, donc le code sous revue = `HEAD`.

**Méthode** : revue **solo en une passe** par le main thread (pas de fan-out multi-agents), combinant (a) des **greps systémiques** sur l'ensemble du repo pour les invariants de convention et de sécurité (wildcard imports, `CommonModule`, `Mat*Module` bruts, logging PII, `console.*`, validation Jakarta, chip ticker, TODO/FIXME), et (b) des **lectures ciblées en profondeur** des modules backend live (`journal/`, `stats/`, `lexicon/`, `auth/security`, `config/`, `shared/`) + leurs DTO/controllers, plus la `SecurityConfig`. Ground truth : `CLAUDE.md`, `architecture.md`, `ddd.md`, skills backend/frontend.

**Couverture honnête (pas de cap silencieux)** :

- **Profond** : sécurité (`SecurityConfig`, exposition actuator, CSRF), `journal/` (service + controller + DTO), `stats/` (service + controller), `lexicon/` (service), `config/` (controller + DTO secrets), `shared/GlobalExceptionHandler`.
- **Systémique (grep)** : conventions Kotlin (imports), conventions frontend (design-system, zoneless, control-flow), logging PII, validation, chip ticker — sur **tout** le repo.
- **Spot-check seulement** : internals des ~11 modules dormants (controllers confirmés exposés, logique métier non relue ligne à ligne), composants frontend (conventions vérifiées + fichiers clés, **pas** une relecture exhaustive des signals/effects/templates), config build (`build.gradle.kts`, workflows CI) **non relue** cette passe.

**État du commit** : branche `master`, dernier commit committé `125d611 feat(stats): create-trade action linking to journal, drop bool columns`. Working tree non-clean (édits docs de la session, non commités).

---

## Résumé exécutif

Le **chemin live du journal de trading** est de très bonne facture : isolation multi-tenant en défense-en-profondeur (prédicat `userId` au niveau service **et** repository), contrat 404-pas-403 systématique pour ne pas leaker l'existence d'une ligne, tri serveur dont le défaut est possédé par le service (pattern documenté), import CSV atomique. La couche sécurité est soignée (401-pas-302 pour les XHR, CSRF cookie-SPA, gating ADMIN par route + méthode HTTP, exposition actuator maîtrisée par profil, secrets jamais ré-émis). Les conventions transverses sont **respectées sans exception détectée** : zéro wildcard import Kotlin, zéro `CommonModule` / `Mat*Module` brut côté frontend, zéro `console.log` parasite, PII jamais loggée, chip ticker partout. Couverture de tests solide (intégration Testcontainers pour journal / stats / lexicon / auth / config + unitaires nombreux).

**0 Bloquant.** Aucun bug de sécurité ou de correction qui empêcherait un usage / une livraison.

**3 À discuter (Important)** :

1. **Pas de Bean Validation sur les DTO d'écriture live** — `TradeEntryRequest` / `StatEntryFormRequest` n'ont aucune annotation `jakarta.validation` et les controllers n'ont pas de `@Valid`. Un seul fichier du backend utilise la validation Jakarta (`TickerNarrativePromptService`, **dormant**). Conséquence : un `ticker` blanc passe (`"".trim().uppercase()` → chaîne vide stockée), et les bornes (`size > 0`, `open_price > 0`, `note` ≤ 2000) ne sont attrapées que par la BDD → exception remontée tardivement (cf. point 2). Le `lexicon/` valide à la main proprement (400 sur blanc) — l'incohérence est que journal / stats ne le font pas. **Reco** : soit Bean Validation + `@Valid` sur les 2 controllers, soit valider à la main façon lexicon, mais uniformément.

2. **`GlobalExceptionHandler` mappe *toute* `DataIntegrityViolationException` → 409 « ressource déjà existante »** — le handler suppose une violation d'unicité, mais il intercepte aussi les violations de **CHECK** (`size > 0`, `open_price > 0`, `exit_price > 0`), de **NOT NULL** et de **longueur**. Une taille négative ou un prix ≤ 0 (non bloqués faute de validation, point 1) renverrait donc « Conflit : ressource déjà existante » — message faux pour l'utilisateur et trompeur au debug. **Reco** : distinguer la cause (inspecter `mostSpecificCause` / le nom de contrainte) pour ne renvoyer 409 que sur l'unicité, sinon 400 ; ou (mieux) ajouter la validation amont (point 1) pour que ces cas ne touchent jamais la BDD. Penser à ajouter un handler `MethodArgumentNotValidException` en même temps que `@Valid`.

3. **Le code « dormant » n'est pas inerte — il est câblé et exposé** — ~11 `@RestController` pré-pivot (`TickerNarrative`, `Prompt`, `NarrativeThumbs`, `NarrativeObservability`, `Market`, `SymbolSearch`, `MarketScreener`, `News`, `Analyst`, `Earnings`, `Watchlist`) restent mappés et servis sous `/api/**` (authentifié), avec leurs services et les clients providers (Finnhub / Twelve Data / FMP / Polygon / Claude / Ollama). C'est de la **surface d'attaque + dette de maintenance + poids de dépendances** pour du code qu'aucune UI live ne consomme (hors `radar` / `ticker` encore routés). La décision de décommission est 🧊 au backlog — l'enjeu est le **coût du report indéfini**, pas un bug. **Reco** : trancher le périmètre de drop (au moins `analysis/` narratif + `news`/`analyst`/`earnings` si la Phase 2 ne les re-câble pas) pour réduire la surface.

**5 Mineurs** : (4) normalisation ticker incohérente entre saisie manuelle (`.trim().uppercase()`) et imports CSV (journal + stats stockent le ticker brut du decoder) → risque de doublon de casse `aapl`/`AAPL` ; (5) import CSV lu intégralement en mémoire (`String(file.bytes)`) sans cap multipart explicite vérifié (`spring.servlet.multipart.max-file-size`) — risque faible en single-user ; (6) 2 SCSS design-system (`_banners.scss`, `_badges.scss`) marqués `//TODO: legacy a supprimer` — CSS mort à retirer ; (7) `StatEntryService.create` / `applyForm` re-assignent `gapUpPercent` / `openPrice` deux à trois fois — redondance inoffensive ; (8) 2 TODO inline restants (`WatchlistService` volet-3 gestion d'erreur, `MockAnalystClient` couplage `LocalDate.now()`) — modules dormants, déjà tracés.

**Verdict global** : `solid / minor-fixes`. Aucun bloquant ; le chemin live est robuste et conforme. Les 2 premiers Importants forment un duo cohérent (validation amont + mapping d'erreur) qui vaut une petite passe ; le 3ᵉ est une **décision produit** (décommission) plus qu'un correctif.

---

## Forces

- **Multi-tenant en défense-en-profondeur** — `TradeEntryService` et `StatEntryService` scopent chaque lecture/écriture par `authService.getCurrentUser().id`, **et** les méthodes repo portent le prédicat `userId` (`findByIdAndUserId`, `deleteByIdAndUserId`, `findByIdAndCreatedBy`). Un controller bugué ou un test ne peut pas leaker cross-tenant. Le 404-pas-403 est appliqué et documenté (pas de leak d'existence). Le modèle stats admin-global (`created_by NULL`) + privé (`created_by = me`) est cohérent et l'export CSV est scopé `created_by IS NULL` (roundtrip intact, lignes privées jamais exportées).

- **`SecurityConfig` réfléchie** — 401 (pas 302 vers Google) pour que l'interceptor SPA décide, CSRF cookie non-HttpOnly + `CsrfTokenRequestAttributeHandler` plain (compatible read-and-forward Angular) + `CsrfTokenResponseFilter` pour forcer l'écriture du cookie, gating ADMIN par route **et** méthode (`POST /api/stats/import`, `POST/PUT/DELETE /api/lexicon`), `oauth2Login` conditionnel à la présence du `ClientRegistrationRepository` (contexte bootable sans OAuth en CI), failure handler → redirect propre `/login?error=…`. Exposition actuator maîtrisée par profil (commentaire explicite sur le risque d'activer `/actuator/env`).

- **Secrets jamais ré-émis** — `ConfigEntryDto.currentValue` et `defaultValue` sont `null` pour les clés `SECRET` ; l'UI n'apprend que `hasValue`. Bonne hygiène (pas de clé en clair dans une réponse ni une capture d'écran).

- **Conventions transverses respectées** — zéro wildcard import Kotlin (allowlist `detekt` non élargie), zéro `CommonModule` et zéro `Mat*Module` brut dans `apps/web` (wrappers `Stb*` partout, imports `@angular/material/*` limités aux tokens d'injection type `MatDialogRef`), zéro `console.log` parasite (seuls les error handlers `main.ts` / `app.config.ts`), PII jamais loggée (email / displayName / providerId n'apparaissent que dans DTO / entité / commentaires), chip ticker `stbChip` utilisée dans journal / stats / radar.

- **Tests comme documentation** — suite d'intégration Testcontainers (vrai PostgreSQL) pour journal / stats / lexicon / auth / config, plus une large couverture unitaire par module. Noms de tests en phrases, fixtures réalistes.

- **Hexagonal appliqué uniformément** — `domain/` (ports + entités) → `application/` (services + DTO) → `infrastructure/` (adapters http / persistence / clients) sur tous les modules, live comme dormants. `GlobalExceptionHandler` centralise le mapping erreur→HTTP, `UpstreamUnavailableException` → 503 fail-soft pour les providers.

---

## Détail des findings

### À discuter

**[Important] 1 — Bean Validation absente des écritures live.** Cf. résumé. `TradeEntryRequest` (`journal/application/dto`) : `ticker: String` non-null mais sans `@field:NotBlank` / `@field:Size(max=20)` ; `size`, `openPrice`… sans `@field:Positive`. `StatEntryFormRequest` : même profil (`create` fait `form.ticker.trim().uppercase()` sans garde blanc). Aucun `@Valid` sur `TradeEntryController` / `StatEntryController`. Le seul usage Jakarta du backend est dans `analysis/` (dormant). Le `lexicon/` montre le pattern manuel propre (`cleanTerm` / `cleanDefinition` → 400) à généraliser si on ne veut pas d'annotations.

**[Important] 2 — Mapping 409 trop large.** `GlobalExceptionHandler.handleConflict` renvoie systématiquement « Conflit : ressource déjà existante » sur `DataIntegrityViolationException`, qui couvre aussi CHECK / NOT NULL / longueur. Combiné au point 1, une entrée invalide (taille ≤ 0, prix ≤ 0, note > 2000) renvoie un 409 au libellé faux. Distinguer la contrainte ou — préférable — valider en amont. Ajouter `MethodArgumentNotValidException` → 400 au moment d'introduire `@Valid`.

**[Important] 3 — Surface du code dormant.** Cf. résumé. ~11 controllers + services + clients providers exposés sous `/api/**`. Ce n'est pas un bug (auth requise, providers en `mock` par défaut) mais une dette structurelle et une surface qui grandit le risque à chaque dépendance bumpée. À arbitrer dans la passe de décommission (déjà 🧊 au backlog).

### Mineurs

- **4 — Normalisation ticker incohérente.** `create` / `update` (journal + stats) normalisent (`.trim().uppercase()`) ; les chemins d'import CSV stockent `request.ticker` brut du decoder. Vérifier que le decoder normalise, sinon aligner pour éviter un doublon de casse.
- **5 — Import CSV en mémoire pleine.** `String(file.bytes, UTF_8)` charge tout le fichier ; confirmer un cap `spring.servlet.multipart.max-file-size` raisonnable. Risque faible en single-user.
- **6 — SCSS legacy mort.** `libs/ui/styles/components/_banners.scss` + `_badges.scss` portent `//TODO: legacy a supprimer` — à retirer.
- **7 — Redondance `StatEntryService`.** `gapUpPercent` / `openPrice` réassignés dans le constructeur, dans `create`/`update` puis dans `applyForm`. Inoffensif, à dédupliquer si on touche au fichier.
- **8 — TODO inline dormants.** `WatchlistService` (gestion d'erreur transverse volet-3) et `MockAnalystClient` (`LocalDate.now()` couplé) — déjà tracés, modules dormants.

---

## Non vérifié / hors passe (à relire si besoin)

- **Logique des composants frontend** (signals / `effect` / templates) — conventions vérifiées par grep + fichiers clés lus, mais pas une relecture exhaustive composant par composant.
- **Internals des modules dormants** — controllers confirmés exposés ; logique métier (LLM dispatch, scoring, clients providers) non relue cette passe.
- **Config build & CI** — `build.gradle.kts`, `detekt.yml`, workflows `.github/`, `application*.yml` non audités ici (couverts par les audits Phase 5 antérieurs).
- **Migrations Flyway** — relues côté schéma lors de la passe doc-maintainer du jour (V1→V5 réels), pas re-auditées ici sur le plan correction.

---

## Suite

Aucune action auto-promue au backlog (convention `docs/projet/audits/`). Candidats naturels si on décide d'en faire des tickets : les Importants 1 + 2 (un petit bundle « validation + mapping d'erreur » sur le chemin write live), et l'Important 3 (alimenter la décision de décommission déjà 🧊).
