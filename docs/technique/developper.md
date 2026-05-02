# Onboarding développeur

Bienvenue. Ce document est conçu pour qu'un nouvel arrivant soit **productif sur PortfolioAI en moins d'une heure** — depuis le clone du repo jusqu'à un dossier ticker complet avec un narratif LLM. Si tu cherches un détail technique précis (commandes, structure, conventions), va plutôt dans [`developpement.md`](./developpement.md). Ici on raconte une histoire, pas une référence.

---

## Ce que fait l'app, en 60 secondes

PortfolioAI est un **outil d'intelligence de marché par ticker**. Pour chaque action / ETF / crypto que tu détiens (importé depuis Wealthsimple) ou que tu surveilles, le backend :

1. **Récupère les données de marché** chez Yahoo Finance (quote courante + 1 an d'historique OHLC).
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

yahoo:
  provider: mock       # voir plus bas — débloque le dev sans dépendre de Yahoo
```

**Option B — Ollama (local, sans clé)** : tourne offline, gratuit, mais latence 30-60 s sur M1 et qualité narrative en retrait. Pratique si tu n'as pas (encore) de clé Claude ou que tu veux dev offline.

```yaml
llm:
  provider: ollama

ollama:
  base-url: http://ollama:11434
  model: mistral       # 7B Instruct, ~4 GB — défaut local

yahoo:
  provider: mock
```

Pense à télécharger le modèle au premier lancement : clic sur **`llm:pull-mistral`** dans l'UI Tilt (~4 GB). Si tu acceptes une latence supérieure (~1-2 min) pour un saut qualitatif, tu peux aussi pull `phi4` (14B, ~9 GB) ou `qwen2.5:14b` et basculer `ollama.model` vers l'un d'eux — bullets plus précis et chiffres mieux référencés.

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

Le projet a deux providers configurables, chacun avec une vraie implémentation et un mock pour dev offline.

### LLM — `llm.provider`

| Valeur | Quand l'utiliser |
|---|---|
| `claude` | Défaut Phase 1. Qualité narrative nettement supérieure, latence 1-3 s, requiert une clé `ANTHROPIC_API_KEY`. |
| `ollama` | Dev offline, sans clé. Modèle `mistral` (7B Instruct, ~4 GB) — défaut local. Latence 30-60 s sur M1. Lance `llm:pull-mistral` dans Tilt pour télécharger. Pour un saut qualitatif (latence ~1-2 min), tu peux pull `phi4` ou `qwen2.5:14b` et bouger `ollama.model`. |

### Yahoo Finance — `yahoo.provider`

| Valeur | Quand l'utiliser |
|---|---|
| `yahoo` | Défaut prod. Vrai fetch HTTP avec headers browser (UA Chrome, Sec-Fetch-*, Referer). Yahoo rate-limite agressivement les IPs résidentielles dev — un dossier ticker en plein dev peut déclencher des 429 prolongés. |
| `mock` | Recommandé en local. `MockMarketChartClient` génère 260 bars OHLC déterministes par symbole (seed = `symbol.hashCode()`). Tous les indicateurs se calculent. Symboles réservés : `UNKNOWN` (404) et `RATELIMIT` (503) pour exercer les chemins d'erreur UI. |

Surcharger dans `application-local.yml`, redémarrer le backend (Tilt le fait tout seul au save).

---

## Quand ça merde

### "Données de marché momentanément indisponibles" sur un dossier ticker

Yahoo rate-limite ton IP. Trois options :

1. **Bascule sur le mock** : `yahoo.provider: mock`. Tu retrouves immédiatement des dossiers fonctionnels (avec données synthétiques). C'est le défaut recommandé en dev.
2. **Attendre 5-15 min** : le rate-limit IP retombe généralement vite.
3. **Vérifier les logs backend** : `tilt logs backend | grep -i yahoo` te donne le statut HTTP et le body de la réponse. Si tu vois `Too Many Requests`, c'est bien un 429 ; si tu vois autre chose, c'est un autre souci.

### Un job narratif reste bloqué `PENDING`

Le backend a probablement crash ou été hot-reloaded en plein appel LLM. Solution simple : régénère un nouveau job (clic "Régénérer"). Le job mort sera ignoré, un nouveau job DONE écrasera l'affichage. Cleanup automatique au boot prévu en dette technique (cf. `backlog.md`).

### Migration Flyway échoue au boot

Probablement un checksum désynchronisé après un édit local d'un fichier `V*__*.sql` déjà appliqué. En dev, le bouton **`db:reset`** dans l'UI Tilt drop le schéma puis Flyway rejoue toutes les migrations from scratch. Tu perds tes données locales — recharge les CSV démo après.

### Le frontend affiche une page blanche

Vérifie que le backend est `Ready` dans Tilt (le frontend se contente d'afficher la dernière réponse cache si l'API tombe). Logs : `tilt logs backend | tail -50`.

### Les tests Vitest ne reconnaissent pas `describe`

Tu lances vitest en standalone (`npx vitest run`), ce qui rate la config Angular. Toujours passer par `ng test` (alias `npm run test` ou `npx ng test --watch=false` en CI mode).

---

## Pour aller plus loin

| Tu veux comprendre… | Va voir |
|---|---|
| Pourquoi le projet existe, ce qu'on essaie de prouver | [`metier/vision.md`](../metier/vision.md) |
| Le découpage des phases et les features livrées / à venir | [`metier/fonctionnalites.md`](../metier/fonctionnalites.md), [`projet/backlog.md`](../projet/backlog.md) |
| L'architecture (modules, schéma BDD, décisions techniques) | [`architecture.md`](./architecture.md) |
| Les conventions de code, commandes Gradle/npm, structure complète | [`developpement.md`](./developpement.md) |
| Conventional Commits + exemples | [`projet/commit-conventions.md`](../projet/commit-conventions.md) |
| L'état exact de la session précédente, ce qui est WIP | [`projet/etat-actuel.md`](../projet/etat-actuel.md) |

---

## Ce qui te manque encore après cet onboarding

C'est volontaire — le but est de faire tourner l'app, pas de devenir expert. Les points suivants viendront naturellement quand tu attaqueras une feature :

- Les **conventions hexagonales** côté front (`core/<name>.repository.ts` = port, `core/adapters/<name>.http.ts` = adapter HTTP). Cf. [`architecture.md`](./architecture.md).
- Le **pipeline async** narratif (`Service` → `Runner @Async` → `Executor`). Cf. [`architecture.md`](./architecture.md) section *analysis/*.
- La **règle "tests as documentation"** : un fichier de test doit se lire comme une histoire. Cf. `.claude/CLAUDE.md`.
- Le **flow de commit** : un seul auteur (toi), Conventional Commits en anglais, message d'une ligne sans body. Cf. [`projet/commit-conventions.md`](../projet/commit-conventions.md).
