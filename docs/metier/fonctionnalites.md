# Fonctionnalités

## Phase 1 — MVP (en cours)

### Portefeuille (lecture seule)

Le portefeuille reflète l'état réel du courtier Wealthsimple — pas de saisie manuelle. L'import d'un export CSV Wealthsimple (« Positions ») crée ou met à jour automatiquement un portefeuille par compte (`Nom du compte`). La vue Dashboard affiche les positions en lecture seule ; la seule action disponible est le lancement d'une analyse IA.

### Import CSV

Depuis l'onglet **Import**, l'utilisateur dépose son export CSV Wealthsimple. L'application :

1. prévisualise les comptes et positions détectés avant confirmation
2. crée ou met à jour un portefeuille par `Nom du compte`
3. upserte les positions (ticker, nom, type, quantité, valeur comptable CAD, valeur marchande, P&L non réalisé)
4. crée un snapshot daté de chaque compte (voir ci-dessous)

### Historique des positions (Suivi)

À chaque import, un snapshot est automatiquement créé par compte, regroupés par import via un `batch_id`. La page **Suivi** affiche une timeline des imports : valeur comptable globale par batch, détail par compte, puis détail des positions avec valeur marchande et P&L. Permet de suivre l'évolution du portefeuille dans le temps sans aucune saisie manuelle.

### Sources de données

22 sources configurables depuis la page Settings : presse financière (Reuters, BFM, CNBC…), données de marché (Yahoo Finance, Stooq…), indicateurs macro (FRED, BCE…) et crypto (CoinGecko…). Chaque source peut être activée ou désactivée. Les sources sont ingérées automatiquement toutes les 15 minutes.

### Analyse IA

Sur demande depuis le Dashboard, l'application analyse le portefeuille sélectionné en croisant les articles récents ingérés. Elle produit :

- une analyse globale avec un niveau de confiance
- une action concrète par position (BUY / SELL / HOLD / REDUCE)
- pour chaque action : poids actuel vs cible, montant cible, delta à effectuer

### Historique des recommandations

Toutes les recommandations générées sont conservées et consultables dans la page **Recommandations IA**, avec filtres par portefeuille et par statut.

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
