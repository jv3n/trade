# Fonctionnalités

## Phase 1 — MVP (en cours)

### Portefeuille

Gestion complète de son portefeuille depuis l'application : créer plusieurs portefeuilles, ajouter des positions (actions, ETF, crypto, obligations, matières premières) avec quantité et prix d'achat moyen.

### Sources de données

22 sources configurables depuis la page Settings : presse financière (Reuters, BFM, CNBC...), données de marché (Yahoo Finance, Stooq...), indicateurs macro (FRED, BCE...) et crypto (CoinGecko...). Chaque source peut être activée ou désactivée. Les sources sont ingérées automatiquement toutes les 15 minutes.

### Analyse IA

Sur demande, l'application analyse le portefeuille en croisant les articles récents ingérés. Elle produit :

- une analyse globale avec un niveau de confiance
- une action concrète par position (BUY / SELL / HOLD / REDUCE)
- pour chaque action : poids actuel vs cible, montant cible en euros, delta à effectuer

### Historique

Toutes les recommandations générées sont conservées et consultables dans la page History, avec filtres par portefeuille et par statut.

---

## Phase 2 — Traçabilité (à venir)

- Comparaison automatique des recommandations passées avec les prix réels
- Score de pertinence par recommandation
- Dashboard d'observabilité

## Phase 3 — Optimisation des prompts (à venir)

- Ajustement automatique des prompts selon les patterns d'erreur
- Détection de biais récurrents
- Rapports de performance

## Phase 4 — Vision long terme

- Fine-tuning sur données historiques personnelles
- Intégration courtiers (paper trading)
- Multi-profils de risque
