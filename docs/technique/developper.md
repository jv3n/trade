# Onboarding développeur

Bienvenue. Ce document est conçu pour qu'un nouvel arrivant soit **productif sur PortfolioAI en moins d'une heure** — depuis le clone du repo jusqu'à un dossier ticker complet avec un narratif LLM. Si tu cherches un détail technique précis (commandes, structure, conventions), va plutôt dans [`developpement.md`](./developpement.md). Ici on raconte une histoire, pas une référence.

---

## Ce que fait l'app, en 60 secondes

PortfolioAI est un **outil d'intelligence de marché par ticker**. Pour chaque action / ETF / crypto que tu détiens (importé depuis Wealthsimple) ou que tu surveilles, le backend :

1. **Récupère les données de marché** chez Twelve Data (quote courante + 1 an d'historique OHLC).
2. **Calcule les indicateurs techniques** côté serveur, en Kotlin pur, testé unit (RSI, MA50/MA200, momentum, drawdown 52w, etc.).
3. **Demande au LLM** (Claude par défaut) de **rédiger un court narratif** à partir de ces indicateurs : `{summary, sentiment, keyPoints[3..5]}`. Le LLM est un **rédacteur**, pas un décideur — il décrit ce que les chiffres montrent, il ne prédit pas et ne donne pas d'ordre d'achat / vente.
4. **Persiste un snapshot** du résultat (prix + indicateurs + narratif + modèle utilisé) pour pouvoir relire dans 6 mois ce que disait l'IA en regardant quoi.

Le portefeuille est **lecture seule** dans l'UI : la seule façon de l'alimenter est l'import d'un CSV Wealthsimple.

---

## Installation en 5 minutes

### Prérequis

- Docker Desktop (running)
- Java 21 (Temurin recommandé, on utilise 21.0.x)
- Node 24 + npm
- Tilt — `brew install tilt` sur macOS, voir [tilt.dev](https://tilt.dev) pour Linux/Windows

### Premier lancement

```bash
git clone <repo-url>
cd trade
tilt up
```

Tilt ouvre son UI sur [http://localhost:10350/](http://localhost:10350/) et démarre quatre services :

| Service | Rôle | URL |
|---|---|---|
| `postgres` | BDD principale (Flyway applique les migrations au boot du backend) | `localhost:5432` |
| `ollama` | LLM local (backup, optionnel) | [http://localhost:11434](http://localhost:11434) |
| `backend` | Spring Boot, profil `local` | [http://localhost:8080](http://localhost:8080) |
| `frontend` | Angular dev server | [http://localhost:4200](http://localhost:4200) |

**Le premier démarrage prend 2-3 minutes** : Gradle télécharge les dépendances et `npm install` s'exécute. Les démarrages suivants sont quasi instantanés grâce au hot-reload de Tilt.

### Configurer le LLM

Le backend a besoin d'un LLM pour générer les narratifs. Crée le fichier `backend/src/main/resources/application-local.yml` (gitignoré, jamais commit). Deux options selon ton contexte :

**Option A — Claude (recommandé)** : qualité narrative nettement supérieure, latence 1-3 s, requiert une clé Anthropic.

```yaml
anthropic:
  api:
    key: sk-ant-...    # ta clé Claude

llm:
  provider: claude     # défaut Phase 1

market:
  provider: mock       # voir plus bas — débloque le dev sans clé Twelve Data
```

**Option B — Ollama (local, sans clé)** : tourne offline, gratuit. Le défaut `qwen2.5:3b` répond en 5-10 s sur M1 — qualité narrative en retrait par rapport à Claude mais largement OK pour itérer.

```yaml
llm:
  provider: ollama

ollama:
  base-url: http://ollama:11434
  model: qwen2.5:3b    # 3B params, ~2 GB — défaut local rapide et fiable sur le JSON

market:
  provider: mock
```

Pense à télécharger le modèle au premier lancement : clic sur **`llm:ensure-model`** dans l'UI Tilt (~2 GB ; idempotent — no-op si déjà pull). Si tu veux pousser la qualité en sacrifiant de la vitesse, tu peux pull `qwen2.5:7b` (~4 GB, 15-30 s), `llama3.2:3b` ou `phi4-mini` (3.8B) et bouger `ollama.model` en conséquence. Mistral 7B était le défaut historique mais 30-60 s par appel sur M1 → timeouts fréquents.

Tu peux switcher de l'un à l'autre à tout moment en éditant `application-local.yml` — Tilt redémarre le backend au save.

---

## Premier test de l'app

### 1. Importer un portefeuille démo

Le repo contient deux CSV factices dans `docs/data-input/` (DEMO-CELI + DEMO-REER avec 6-7 positions chacun). Va sur [http://localhost:4200/import](http://localhost:4200/import), drag & drop **les deux fichiers ensemble**. L'app détecte automatiquement les dates dans le nom de fichier (`holdings-report-2026-04-15.csv` etc.), trie par ordre chronologique, et applique chaque import comme un snapshot.

> Pour tes vrais exports Wealthsimple, mets-les dans `docs/data-input-local/` (gitignoré) — jamais dans `data-input/` qui est versionné.

### 2. Voir le portefeuille agrégé

Le **Dashboard** (`/`) affiche les positions consolidées : ticker, quantité, prix d'achat moyen, valeur de marché, P&L par devise. Chaque ticker est cliquable.

### 3. Ouvrir un dossier ticker

Clique sur **AAPL** (ou n'importe quel ticker du portefeuille démo). La page **Dossier ticker** (`/ticker/AAPL`) charge :

- En-tête avec le prix, la plage 52 semaines, le nom de l'instrument
- Une courbe SVG inline du prix sur 1 an
- 10 chips d'indicateurs avec color-coding (RSI, MA50/MA200, momentum 30j/90j, perfs, drawdown, distance vs MA, volume relatif)

### 4. Switcher la langue

Dans le header en haut à droite, l'icône drapeau ouvre un menu **FR / EN**. Le choix est persisté dans `localStorage` et appliqué à toute l'UI (l'attribut `<html lang>` est aussi mis à jour pour l'accessibilité). Si ton navigateur est en français, l'app démarre en FR par défaut, sinon en EN.

Les fichiers de traduction sont dans `frontend/public/i18n/<lang>.json`. Toute string utilisateur passe par une clé — rien n'est en dur dans les composants.

### 5. Générer un narratif LLM

Le narratif est généré à la demande (cher en Claude, lent en Ollama). Clique sur **Générer / Régénérer** — le frontend POST `/api/market/ticker/AAPL/narrative`, reçoit un job `PENDING`, et poll toutes les 5s jusqu'à `DONE`. Une fois le snapshot prêt, tu vois un résumé en 2-3 phrases, un badge `BULLISH` / `NEUTRAL` / `BEARISH`, et 3 à 5 bullet points factuels.

> Si tu cliques deux fois en moins de 30 minutes sur le même ticker, le 2e clic réutilise le snapshot existant (cache 30 min côté service). Pas de re-prompt LLM, pas de coût supplémentaire.

---

## Switcher les providers

Le projet a cinq providers configurables, chacun avec une vraie implémentation et (sauf Claude) un mock pour dev offline / sans clé.

### LLM — `llm.provider`

| Valeur | Quand l'utiliser |
|---|---|
| `claude` | Défaut Phase 1. Qualité narrative nettement supérieure, latence 1-3 s, requiert une clé `ANTHROPIC_API_KEY`. |
| `ollama` | Dev offline, sans clé. Défaut local : `qwen2.5:3b` (3B Instruct, ~2 GB), 5-10 s par narratif sur M1, JSON structuré fiable. Lance `llm:pull-qwen` dans Tilt pour télécharger. Pour pousser la qualité au prix de la vitesse : `qwen2.5:7b`, `llama3.2:3b` ou `phi4-mini`. Mistral 7B (ancien défaut) timeout sur M1 — éviter. |

### Données de marché — `market.provider`

| Valeur | Quand l'utiliser |
|---|---|
| `mock` | Défaut, sans clé requise. `MockMarketChartClient` génère 260 bars OHLC déterministes par symbole (seed = `symbol.hashCode()`). Tous les indicateurs se calculent. Symboles réservés : `UNKNOWN` (404) et `RATELIMIT` (503) pour exercer les chemins d'erreur UI. |
| `twelvedata` | Vraie data, défaut prod. REST documenté + apikey, free tier 800 credits/jour, TSX natif. Requiert `market.twelvedata.api-key` (env `TWELVEDATA_API_KEY`). **Crée un compte gratuit** sur [twelvedata.com](https://twelvedata.com/) puis récupère ta clé sur [https://twelvedata.com/account/api-keys](https://twelvedata.com/account/api-keys), et colle-la dans `application-local.yml` sous `market.twelvedata.api-key`. |

### News par ticker — `news.provider`

| Valeur | Quand l'utiliser |
|---|---|
| `mock` | Défaut, sans clé requise. `MockNewsClient` génère 4-10 headlines synthétiques déterministes par symbole (templates variés, sources rotation Reuters/Bloomberg/CNBC, ~10 % de symboles "quiet" pour exercer l'empty-state UI). Idéal en itération pour ne pas faire chauffer le quota Finnhub. |
| `finnhub` | Vraie data. REST + apikey, free tier 60 calls/min sans cap quotidien. Requiert `market.finnhub.api-key` (env `FINNHUB_API_KEY`). **Crée un compte gratuit** sur [finnhub.io/register](https://finnhub.io/register) puis récupère ta clé sur [finnhub.io/dashboard](https://finnhub.io/dashboard), et colle-la dans `application-local.yml` sous `market.finnhub.api-key`. |

### Recommandations analystes — `analyst.provider`

Toggle séparé de `news.provider` pour pouvoir flipper indépendamment (live news + mock recos pendant l'itération, par exemple). Partage la même clé Finnhub que `news.provider` quand tu bascules en `finnhub`.

| Valeur | Quand l'utiliser |
|---|---|
| `mock` | Défaut, sans clé requise. `MockAnalystClient` génère un breakdown synthétique déterministe par symbole (~50 % bullish / ~30 % mixed / ~20 % bearish, drift mois-sur-mois pour une trend line non plate, history sur 6 mois). Symboles réservés : `UNKNOWN` (404 → empty state), `RATELIMIT` (503 → inline error), `NOTARGET` (snapshot avec `priceTarget = null` pour reproduire la dégradation Finnhub sans flipper de provider). |
| `finnhub` | Vraie data — `/stock/recommendation` (breakdown monthly, requis) + `/stock/price-target` (consensus 12 mois, optionnel — fail-soft à `null` sur 401/403/5xx parce que sur certains comptes l'endpoint est derrière un paid tier). Partage la même `market.finnhub.api-key` que `news.provider`. |

### Earnings — `earnings.provider`

Toggle séparé de `news.provider` et `analyst.provider`. Partage la même clé Finnhub quand tu bascules en `finnhub`.

| Valeur | Quand l'utiliser |
|---|---|
| `mock` | Défaut, sans clé requise. `MockEarningsClient` génère 4 trimestres synthétiques déterministes par symbole (EPS dans la bande $0.30–$3.50, surprise ±15 % autour de l'estimé, drift ±8 % d'un trimestre à l'autre) + une next-date 1–60 j en avant. Symboles réservés : `UNKNOWN` (404 → empty state), `RATELIMIT` (503 → inline error), `NOCALENDAR` (snapshot avec `nextEarningsDate = null` pour reproduire la dégradation Finnhub sans flipper de provider). |
| `finnhub` | Vraie data — `/stock/earnings` (4 derniers Q estimate / actual / surprise %, requis) + `/calendar/earnings` (prochaine annonce sur fenêtre 90 j en avant, optionnel — fail-soft à `null` sur 401/403/5xx parce que sur certains comptes l'endpoint est derrière un paid tier). Partage la même `market.finnhub.api-key` que les autres providers Finnhub. |

Deux chemins pour modifier ces réglages :

1. **`application-local.yml`** — défaut au boot, recharge au save Tilt. Pertinent pour figer la config d'un environnement.
2. **Page `/settings/configuration`** (icône `tune` dans le sidenav `/settings`) — édite en direct les clés API Twelve Data et Finnhub (avec bouton "Tester" qui sonde la clé candidate avant la sauve), le TTL cache Caffeine, et bascule `market.provider` / `news.provider` / `analyst.provider` / `earnings.provider` mock ↔ live à la volée. Aucune édition YAML, aucun reboot, le prochain dossier ouvert hit le nouveau adapter. Les overrides vivent en BDD (`app_config`, V4) et prennent le pas sur les défauts YAML.

Pour la liste complète des providers (URLs d'inscription, dashboards, quotas, points d'intégration code) voir [`providers.md`](./providers.md).

---

## Quand ça merde

### "Données de marché momentanément indisponibles" sur un dossier ticker

Le provider sélectionné refuse la requête. Diagnostic selon `market.provider` :

1. **`twelvedata`** — clé manquante (`market.twelvedata.api-key` vide → message explicite dans les logs) ou quota 800 credits/jour épuisé. Vérifier avec `tilt logs backend | grep -i "twelve data"`. Si quota explosé, bascule temporairement sur `mock`.
2. **`mock`** — ne devrait jamais arriver sauf si tu testes les symboles réservés `RATELIMIT` ou `UNKNOWN`.

### Un job narratif reste bloqué `PENDING`

Le backend a probablement crash ou été hot-reloaded en plein appel LLM. Solution simple : régénère un nouveau job (clic "Régénérer"). Le job mort sera ignoré, un nouveau job DONE écrasera l'affichage. Cleanup automatique au boot prévu en dette technique (cf. `backlog.md`).

### Migration Flyway échoue au boot

Probablement un checksum désynchronisé après un édit local d'un fichier `V*__*.sql` déjà appliqué. En dev, le bouton **`db:reset`** dans l'UI Tilt drop le schéma puis Flyway rejoue toutes les migrations from scratch. Tu perds tes données locales — recharge les CSV démo après.

### Le frontend affiche une page blanche

Vérifie que le backend est `Ready` dans Tilt (le frontend se contente d'afficher la dernière réponse cache si l'API tombe). Logs : `tilt logs backend | tail -50`.

### Les tests Vitest ne reconnaissent pas `describe`

Le projet utilise **Vitest** (pas Karma — `ng test` invoque le builder Angular et rate la config). Toujours passer par `npm run test` (full suite watch) ou `npx vitest run src/path/to/file.spec.ts` (un seul fichier en CI mode).

### `npm run lint` pète sur des règles a11y / inject / array-type

ESLint flat config (`frontend/eslint.config.js`) est configuré sur Angular ESLint 21 + a11y des templates. Premier réflexe : `npm run lint -- --fix` auto-corrige les violations triviales (formatage, `Array<T>` → `T[]`, etc.). Pour le reste, les patterns à connaître :
- **`prefer-inject`** : remplace `constructor(private foo: Foo)` par `private readonly foo = inject(Foo)` (le pattern dominant du projet).
- **`click-events-have-key-events` + `interactive-supports-focus`** : un `<div>` ou `<li>` avec `(click)` doit avoir `role="button" tabindex="0" (keydown.enter)`. Convertir en `<button>` est aussi acceptable mais souvent casse le styling.
- **`label-has-associated-control`** : un `<label>` doit cibler un input via `for=` ; si c'est juste un titre de section, utiliser `<span class="label">`.

Détails ruleset + commandes dans [`ops.md`](./ops.md) section ESLint.

---

## Pour aller plus loin

| Tu veux comprendre… | Va voir |
|---|---|
| Pourquoi le projet existe, ce qu'on essaie de prouver | [`metier/vision.md`](../metier/vision.md) |
| Le découpage des phases et les features à venir | [`metier/fonctionnalites.md`](../metier/fonctionnalites.md), [`projet/backlog.md`](../projet/backlog.md) (`⏳`/`🚧` uniquement) |
| Le journal des features déjà livrées (par phase, reverse-chronological) | [`projet/journal-livraisons.md`](../projet/journal-livraisons.md) |
| L'architecture (modules, schéma BDD, décisions techniques) | [`architecture.md`](./architecture.md) |
| Les conventions de code, commandes Gradle/npm, structure complète | [`developpement.md`](./developpement.md) |
| Providers externes (Twelve Data, Finnhub, Anthropic, Ollama) — clés, quotas, dashboards | [`providers.md`](./providers.md) |
| CI / CD, caching, Detekt, Dependabot, Code Scanning | [`ops.md`](./ops.md) |
| Conventional Commits + exemples | [`projet/commit-conventions.md`](../projet/commit-conventions.md) |
| L'état exact de la session précédente, ce qui est WIP | [`projet/etat-actuel.md`](../projet/etat-actuel.md) |

---

## Ce qui te manque encore après cet onboarding

C'est volontaire — le but est de faire tourner l'app, pas de devenir expert. Les points suivants viendront naturellement quand tu attaqueras une feature :

- Les **conventions hexagonales** côté front (`core/<name>.repository.ts` = port, `core/adapters/<name>.http.ts` = adapter HTTP). Cf. [`architecture.md`](./architecture.md).
- Le **pipeline async** narratif (`Service` → `Runner @Async` → `Executor`). Cf. [`architecture.md`](./architecture.md) section *analysis/*.
- La **règle "tests as documentation"** : un fichier de test doit se lire comme une histoire. Cf. `.claude/CLAUDE.md`.
- Le **flow de commit** : un seul auteur (toi), Conventional Commits en anglais, message d'une ligne sans body. Cf. [`projet/commit-conventions.md`](../projet/commit-conventions.md).
