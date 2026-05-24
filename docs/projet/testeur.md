# Onboarding testeur

> Tu n'es pas développeur·euse mais tu veux **cliquer dans PortfolioAI** pour la tester. Ce doc te dit comment l'avoir up sur ton Mac / PC en ~10 minutes, sans clé API ni daemon LLM à configurer. Pour aller plus loin (modifier du code, comprendre l'archi), va plutôt sur [`developper.md`](../technique/developper.md).

---

## Ce que tu vas pouvoir faire

L'app tourne **entièrement en mode mock par défaut** : pas besoin de clé API Twelve Data, Finnhub ou Anthropic. Les charts, news, recommandations d'analystes, earnings et le narratif IA sont **synthétiques mais réalistes** — déterministes par symbole, suffisants pour tester le flow complet.

Concrètement, tu pourras :

- Importer un portefeuille démo (CSV fournis dans le repo),
- Ouvrir un dossier ticker (chart 1Y, indicateurs RSI/MA, news, analystes, earnings),
- Générer un narratif IA mock (~1 s par dossier),
- Ajouter / retirer des tickers d'une watchlist,
- Naviguer entre les pages Suivi, Observabilité, Settings.

---

## Prérequis (à installer une fois)

| Outil | Pourquoi | Comment |
|---|---|---|
| **Docker Desktop** | Lance Postgres + Ollama dans des containers | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) — assure-toi qu'il **tourne** avant l'étape suivante (icône baleine dans la barre des menus). |
| **Java 21** | Le backend Spring Boot tourne directement sur ton OS (pas en container). | [adoptium.net](https://adoptium.net/) — choisis « Temurin 21 LTS ». |
| **Node 24** + npm | Pareil, le frontend Angular tourne en local. | [nodejs.org](https://nodejs.org/) — version « LTS » de 24+. |
| **Tilt** | Orchestre tout (Postgres + Ollama + backend + frontend) avec une UI web. | macOS : `brew install tilt` · Windows / Linux : [tilt.dev/install](https://tilt.dev/install). |

> **Note** — on ne lance pas tout dans Docker (backend + frontend tournent natifs sur ton OS, c'est pour ça que Java + Node sont nécessaires). C'est volontaire — ça accélère le hot-reload pendant le dev. Une variante 100 % Docker est dans le backlog mais pas livrée.

---

## Démarrer

```bash
git clone https://github.com/jv3n/trade.git
cd trade
tilt up
```

Tilt ouvre son UI sur [http://localhost:10350/](http://localhost:10350/) et démarre 4 services. Le **premier boot prend 2-3 min** (téléchargements Gradle + `npm install`). Tu peux suivre l'avancement dans l'UI Tilt — chaque service passe au vert quand il est prêt.

Une fois tout vert, ouvre [http://localhost:4200](http://localhost:4200) — l'app est là. Pas de login à faire : en mode dev, un utilisateur fake (`dev@local.test`) est automatiquement loggé en ADMIN.

---

## Tour guidé en 5 clics

1. **Import** — `/import` : glisse-dépose les deux CSV de `docs/data-input/` (`DEMO-CELI-...csv` + `DEMO-REER-...csv`). Le portefeuille apparaît.
2. **Dashboard** — `/dashboard` : la liste des positions agrégée, avec un sparkline et le P/L par ticker.
3. **Dossier ticker** — clic sur n'importe quelle row : chart 1Y + indicateurs + news synthétiques + recommandations analystes + earnings.
4. **Générer un narratif IA** — bouton **Générer le narratif** sur le dossier (en bas de la card narrative). ~1 s de latence (mock), tu vois un texte court avec un sentiment BULLISH / NEUTRAL / BEARISH.
5. **Watchlist** — `/dashboard` panneau **Watchlist**, ajoute n'importe quel symbole (`AAPL`, `NVDA`, `MSFT`…). Pas besoin qu'il soit dans le portefeuille — la watchlist est indépendante.

Pour switcher la langue : icône globe en haut à droite (FR ↔ EN, ~700 clés traduites).

---

## Quand ça merde

| Symptôme | Cause probable | Fix |
|---|---|---|
| `tilt up` échoue sur « port already allocated » | Un Postgres déjà installé localement occupe le `5432` (le plus courant), ou un autre service le `4200` / `8080` / `11434`. | Copie `.env.example` en `.env` à la racine et édite le port qui pose problème (cf. [`developpement.md > Conflit de port`](../technique/developpement.md)). |
| Page blanche sur `localhost:4200` | Le frontend n'a pas fini de booter, ou il a planté. | Regarde le panel `frontend` dans Tilt (clic sur la ressource) — la stack d'erreur est là. |
| Le dossier ticker dit « Données momentanément indisponibles » | Probablement un provider live (Twelve Data / Finnhub) sélectionné sans clé. | Va sur `/settings/configuration > Providers de données`, force chaque provider sur `mock`. |
| « Cannot connect to Docker daemon » | Docker Desktop n'est pas lancé. | Lance Docker Desktop, attends que la baleine soit stable, refais `tilt up`. |

Pour le reste, cf. [`developper.md > Quand ça merde`](../technique/developper.md#quand-ça-merde) — couvre les cas plus techniques (migrations Flyway, jobs narratifs stuck, lint Vitest).

---

## Pour aller plus loin

- **Tester avec de vraies données** — clés API runtime à câbler via `/settings/configuration` (Twelve Data + Finnhub gratuits, Claude payant ~$0.01/dossier). Détails dans [`developper.md > Configurer le LLM`](../technique/developper.md#configurer-le-llm).
- **Modifier du code** — bascule sur [`developper.md`](../technique/developper.md) pour l'archi (Angular signal-based, Kotlin hexagonal) + [`developpement.md`](../technique/developpement.md) pour les commandes (`./gradlew test`, `npm run lint`, etc.).
- **Comprendre la vision produit** — [`metier/vision.md`](../metier/vision.md) explique pourquoi le LLM est un **rédacteur**, pas un devin.
