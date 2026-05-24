# Vision

## Le problème

Suivre un portefeuille demande du temps : pour chaque titre détenu, lire la presse, regarder le graphe, comparer aux indicateurs techniques (RSI, moyennes mobiles), comprendre la dynamique récente. La plupart des investisseurs individuels n'ont pas ce temps — et finissent par décider sans contexte ou par réagir à des titres d'articles isolés.

## L'idée

PortfolioAI agrège pour chaque ticker (de ton portefeuille ou de ta watchlist) :

1. **Données de marché** issues de Twelve Data — prix, historique OHLC, volumes, fundamentals
2. **Indicateurs techniques calculés** côté serveur — RSI, MA50 / MA200, momentum, drawdown 52w, volume relatif
3. **Un narratif synthétique** produit par un LLM à partir des deux ci-dessus

Le résultat est un **dossier ticker** : la courbe, les indicateurs, et 2-3 paragraphes qui te racontent ce qui se passe. Tu lis, tu décides.

Exemple de sortie :

> *"AAPL est en uptrend depuis 3 mois (+18%), au-dessus de sa MA50 et de sa MA200. RSI à 68 — proche de la zone de surachat sans y être encore. Le volume des 10 dernières séances est ~30% au-dessus de la moyenne, ce qui confirme la force du mouvement. Vigilance court terme : un RSI > 70 et une distance à la MA50 > 8% historiquement coïncidaient avec des respirations de quelques semaines."*

## Le rôle de l'IA — explicite

> Le LLM est un **rédacteur**, pas un **décideur**.

Il **digère** des données déjà calculées (indicateurs, prix, fondamentaux) et les **synthétise** en langage naturel. Il **ne prédit pas** la direction du prix. Il **ne calcule pas** d'indicateurs (les vrais chiffres viennent du code, pas du modèle — sinon il hallucine).

Ce que le LLM apporte :

- une **lecture rapide** d'un état de marché ("uptrend / range / downtrend, avec/sans confirmation volume")
- un **contexte qualitatif** quand des fundamentals sont disponibles
- une **comparaison cross-tickers** ("AAPL et MSFT divergent sur le momentum 30j")

Ce qu'il n'apporte pas (et ne prétend pas apporter) :

- un signal d'achat/vente avec edge
- une prédiction de cours
- du conseil financier au sens réglementaire

## Observabilité honnête

Plutôt que de mesurer "est-ce que la reco IA a eu raison" (impossible à isoler du bruit du marché), on mesure **la qualité du narratif** :

- Chaque dossier consulté est snapshoté (prix + indicateurs + texte produit, à la date)
- A posteriori on peut regarder : *"ce que disait l'IA le 1er mars — vs ce qu'a fait le titre depuis"*
- Détection de biais récurrents (toujours bullish, toujours wait-and-see, etc.)

Ce feedback alimente l'itération sur le prompt — pas sur "fais-moi gagner de l'argent", mais sur "écris-moi un meilleur résumé".

```
Twelve Data API
        │
        ▼
  Indicateurs (Kotlin)
        │
        ▼
   LLM (Claude)
        │
        ▼
  Dossier ticker  ───────────────────────┐
        │                                │
   Snapshot persisté                     │
        │                                │
   Observabilité                         │
   (relecture a posteriori)              │
        │                                │
   Itération prompt  ◄───────────────────┘
        │
   Narratifs améliorés
```

## Le pipeline d'analyse — composer au-dessus du dossier ticker

Le dossier ticker individuel est l'**unité atomique** de l'application. Tout le reste se construit par composition au-dessus.

L'analyse à l'échelle du portefeuille **n'est pas** un nouveau prompt qui recevrait toutes les positions à la fois (c'était l'erreur de Phase 0 — un seul appel LLM monolithique sur N positions, lent, hallucinant et impossible à cacher granulairement). C'est un **DAG** : N analyses ticker indépendantes en parallèle (les feuilles), suivies d'une étape d'agrégation qui synthétise leurs sorties.

```
PortfolioAnalysis(today)             ← parent (déclenché depuis le dashboard)
├── TickerAnalysis(VOO, today)       ← cache hit → DONE_CACHED instant, 0 LLM
├── TickerAnalysis(NVDA, today)      ← cache miss → RUNNING (1 appel Claude/Ollama) → DONE
├── TickerAnalysis(MSFT, today)      ← cache hit → DONE_CACHED instant, 0 LLM
└── PortfolioAggregation             ← attend tous les enfants, puis 1 appel LLM final qui digère
                                       les N narratifs déjà persistés (pas les indicateurs bruts)
```

**Trois propriétés essentielles** que ce modèle apporte par rapport à un appel monolithique :

1. **Économie LLM par cache granulaire**. Une feuille `TickerAnalysis(symbol, day)` lookup d'abord `ticker_narrative_snapshot` ; si une entrée fraîche existe, la feuille passe directement en `DONE_CACHED` sans toucher Claude/Ollama. Le coût d'une analyse portefeuille n'est **pas** N+1 appels LLM mais ~ M appels LLM où M = nombre de tickers non encore analysés ce jour. Pour un user qui ouvre quelques dossiers individuels avant d'agréger, M tend vers 0.

2. **Visibilité par décomposition**. L'utilisateur voit en temps réel quelles feuilles ont hit le cache, lesquelles tournent, et l'agrégation finale qui attend. Façon « pipeline GitHub Actions » : status par étape, durée par étape, retry granulaire d'une feuille ratée sans relancer tout le DAG. Un échec sur NVDA n'invalide pas l'analyse VOO qui était correcte.

3. **Composabilité**. Le primitif `TickerAnalysis(symbol, day)` est trigger par **trois origines distinctes** sans duplication : (a) ouverture manuelle du dossier ticker (Phase 1 actuelle), (b) ce nouveau pipeline portfolio, (c) un cron quotidien futur qui pré-chauffe le cache pour les positions détenues avant l'arrivée du user. Un seul moteur, trois entry points, même cache.

### Ce que cela implique pour les phases à venir

- **Phase 3 (observabilité narrative)** — clôturée 2026-05-14 avec timeline reverse-chronologique, score de cohérence cross-runs et dashboard de biais corpus-wide. L'observabilité existe ticker par ticker via les snapshots Phase 1. Ce qui manque encore c'est la **vue pipeline** : voir le DAG des runs passés, le détail par feuille, le cache-hit ratio dans le temps. La page « Jobs » initialement projetée ici a été déplacée en Phase 7 — elle dépend du DAG unifié (Phase 7 Vague 1 #1) qui n'existe pas avant.

- **Phase 5 (déploiement)** — quand l'app sortira du localhost, c'est ce qui est construit à ce moment-là (Phase 1+2+3+4) qui part en prod. Le DAG n'existe pas encore à ce stade : chaque ouverture de dossier ticker déclenche un appel LLM hors dedup window, le coût et la durée restent dépendants du chemin chaud.

- **Phase 7 (DAG en prod + réintégration Phase 0)** — une fois le DAG livré (Vague 1 #1), la « Réintégration Phase 0 » devient le premier consumer parent réel : `PortfolioAggregation` au-dessus de l'infrastructure ticker existante (pas de retour de l'ancien moteur, pas de scraping RSS, pas de prompt monolithique — juste un agrégateur qui consomme `TickerNarrativeSnapshot` × N + analyst recos + earnings + news par ticker). À partir de ce moment la prod devient cheap et prévisible : chaque feuille est un job retryable, la durée est bornée par le cache, le coût LLM est prévisible (~ M × prix par token). La cron daily (Vague 2 #4) pré-chauffe sur les positions détenues hors heures de bureau, donc l'utilisateur arrive sur un dashboard où tout est déjà prêt et où une analyse portefeuille est cache-hit pur.

### Le contrat avec l'utilisateur

> *« Quand tu cliques "Analyser le portefeuille", tu vois exactement ce qui se passe. Les tickers déjà analysés aujourd'hui sont instantanés. Les nouveaux génèrent un narratif individuel chacun. Tu peux ouvrir n'importe quelle feuille pour voir son détail. Quand tout est prêt, l'agrégation te donne la vue d'ensemble. Si quelque chose plante, tu vois quoi, tu peux relancer juste cette étape. »*

C'est ce **contrat de transparence** qui distingue l'app d'un appel LLM opaque qui « réfléchit » pendant 30 s avant de cracher un mur de texte.

## Disclaimer

PortfolioAI est un outil d'aide à la lecture des marchés. Il ne constitue pas un conseil en investissement agréé. Les narratifs sont générés par un modèle IA à partir de données publiques, et ne remplacent pas l'avis d'un professionnel financier. Les indicateurs techniques sont calculés à partir de données fournies par des tiers (Twelve Data) sans garantie de complétude ou d'exactitude.
