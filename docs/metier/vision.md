# Vision

## Le pivot

Jusqu'en juin 2026, PortfolioAI était un outil d'intelligence de marché *par ticker* : pour chaque action suivie, le backend récupérait les données Twelve Data, calculait des indicateurs techniques, et un LLM rédigeait un court narratif. L'app a **pivoté** vers un **journal de trading**. L'unité atomique n'est plus le dossier ticker — c'est le **trade**. L'ancienne surface (dossiers, narratifs LLM, radar d'anomalies, portefeuille Wealthsimple) reste dans l'arbre en **sommeil**, réservée à un éventuel enrichissement Phase 2 ; elle n'est plus le produit.

## Le problème

Le trader actif — ici un profil **short small-caps** (gap-up shorts, prix $1–$10) — a besoin de **journaliser** chaque trade pour progresser : qu'est-ce que j'ai joué, dans quel setup, et qu'est-ce que ça a donné. Un tableur fait le job au début mais devient vite pénible : aucune validation, pas de checklist pré-trade, pas de filtre par pattern, pas de relecture structurée. Et l'analyse rétrospective (« mes shorts FRD en front-side, c'est rentable ? ») oblige à tout retaper à la main.

## L'idée

Un **journal de trading** où chaque journée se logue trade par trade. Le **trade entry** est l'unité atomique ; il porte trois familles de champs :

1. **Exécution** — date, ticker, *play* (A / B), *pattern* (GUS / FRD), taille, prix d'entrée, prix de sortie, P&L en dollars, gain %.
2. **Checklist pré-trade** — les conditions du setup au moment d'entrer : fenêtre 9h35–10h, gap up ≥ 50 %, prix $1–$10, float 3–50M, attente du push, *open side* (front / back), short sur résistance, stratégie de sortie (swing +20 % / fin de journée).
3. **Post-mortem** — note libre + note d'erreur (ce que j'aurais dû faire).

La **table est la surface principale** : tri côté serveur, pagination, filtres (période, play, pattern, statut ouvert / clos / gagnant / perdant, recherche ticker), ajout / édition via dialog, suppression. Le tout adossé à un **export / import CSV roundtrip-safe** (UTF-8 BOM, RFC 4180, compatible Excel) — tu sors ton journal, tu le retravailles dans un tableur, tu le réimportes sans perte (import atomique : tout passe ou rien).

## Le vocabulaire du domaine

Le journal parle le langage du trader, pas un jargon générique. Ces énumérations sont des **types Postgres natifs** — le schéma contraint les valeurs, ce ne sont pas des strings libres :

- **Play A / B** — conviction du setup (A = haute conviction, B = secondaire / opportuniste).
- **Pattern GUS / FRD** — `GUS` (gap-up continuation) et `FRD` (front-side reversal down, exhaustion parabolique).
- **Open side FRONT / BACK** — entrée côté tendance vs entrée sur le fade du reversal.
- **Exit strategy SWING_20 / EOD** — tenir jusqu'à +20 % vs clôturer en fin de journée.

## Le rôle de l'IA — explicite

> **Aucun LLM dans le chemin live aujourd'hui.**

Le journal est un outil de saisie et de relecture honnête : ce que tu écris est ce que tu lis. Pas de prédiction, pas de génération. Les clients providers (Twelve Data, FMP, Polygon, Finnhub) restent câblés mais **dormants**, gardés pour la Phase 2 — l'idée étant d'enrichir un trade *a posteriori* avec le graphe du symbole au moment de l'entrée, pas de décider à ta place.

## Phase 2 — ce qui vient

Le MVP, c'est la table + le CSV. Ensuite :

- **Stats** — taux de réussite, P&L cumulé, performance par play / pattern / open side, séries gagnantes-perdantes.
- **Charts** — courbe d'equity, distribution des gains, heatmap par jour / setup.
- **Export Excel** — au-delà du CSV brut, un classeur exploitable.
- **Enrichissement** (éventuel) — rattacher le chart du symbole au trade via les providers conservés.

## Ce que le journal n'est pas

- Un broker ou un moteur d'exécution — tu logues *après coup*, ce n'est pas connecté au courtier.
- Un conseiller — il ne te dit pas quoi trader.
- Un outil multi-actifs généraliste — il est taillé pour le short small-caps US.

## Disclaimer

PortfolioAI est un outil personnel de journalisation et de relecture de trades. Il ne constitue pas un conseil en investissement agréé et ne remplace pas l'avis d'un professionnel financier.
