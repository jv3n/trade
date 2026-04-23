# 📈 PortfolioAI — Optimiseur de Portefeuille Boursier Intelligent

> Un système d'analyse financière alimenté par l'IA, capable d'ingérer des journaux économiques, de générer des recommandations d'investissement, et de s'améliorer en continu grâce à une boucle de feedback.

---

## 🎯 Vision du projet

L'idée est simple : au lieu de lire soi-même des dizaines d'articles financiers chaque jour, une application fait ce travail à ta place, analyse le contexte macroéconomique, et te propose des actions concrètes sur ton portefeuille.

**Exemple concret :**
> *"Compte tenu de la hausse des tensions géopolitiques et des données d'inflation publiées cette semaine, il serait opportun de réduire ta position sur VOO et d'augmenter ton exposition à l'or (GLD)."*

L'application ne se contente pas de suggérer — elle **apprend de ses erreurs** en comparant ses recommandations passées avec ce qui s'est réellement passé sur les marchés.

---

## 🏗️ Architecture technique

### Stack choisie

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Frontend | Angular 21 | Maîtrise existante, framework robuste pour dashboards |
| Backend | Kotlin + Spring Boot | Maîtrise existante, typage fort, excellent écosystème JVM |
| Build | Gradle (Kotlin DSL) | Standard pour projets Kotlin/Spring |
| IA | Claude API (Anthropic) | Excellente compréhension du langage naturel financier |
| Base de données | PostgreSQL | Données relationnelles, historique des recommandations |

### Vue d'ensemble de l'architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        SOURCES DE DONNÉES                    │
│   RSS Journaux  │  APIs Financières  │  Flux Économiques     │
│  (Bloomberg, Reuters, Le Devoir, etc.) │ (Alpha Vantage...)  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Kotlin + Spring)                  │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │  Ingestion  │──▶│  Analyse IA  │──▶│  Recommandations │  │
│  │  des flux   │   │ (Claude API) │   │  + Persistance   │  │
│  └─────────────┘   └──────────────┘   └──────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │             Observabilité & Scoring                   │   │
│  │   Suivi des suggestions │ Comparaison vs réalité     │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   FRONTEND (Angular 21)                      │
│                                                              │
│   Dashboard portefeuille  │  Recommandations IA             │
│   Historique & scoring    │  Configuration des sources      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 La boucle d'amélioration continue (MLOps)

C'est le cœur différenciateur du projet. L'application ne se contente pas de donner des conseils — elle **mesure sa propre performance** et s'améliore.

```
  Journaux & Données marché
           │
           ▼
      Analyse IA
           │
           ▼
    Recommandation ──────────────────────────────┐
           │                                      │
    Action (ou non)                               │
           │                                      │
    Résultat réel du marché                       │
           │                                      │
    ┌──────▼──────────────────────┐               │
    │  OBSERVABILITÉ              │               │
    │  Suggestion vs Réalité      │               │
    │  Score de pertinence        │               │
    └──────┬──────────────────────┘               │
           │                                      │
    Correction des prompts ◀─────────────────────┘
           │
    Recommandations améliorées
```

### Métriques trackées

- **Précision directionnelle** — l'IA a-t-elle bien prédit la direction du mouvement ?
- **Performance relative** — comparaison vs benchmark (ex: VOO, S&P 500)
- **Taux de confiance vs réussite** — calibration du niveau de certitude exprimé
- **Performance par type d'actif** — l'IA est-elle meilleure sur les ETFs ? les matières premières ?

---

## 📅 Phases de développement

### Phase 1 — MVP 🚀
*Objectif : Avoir une recommandation IA de bout en bout*

- Structure du projet Angular + Spring Boot
- Modèle de données : portefeuille, actifs, recommandations
- Ingestion de quelques sources RSS financières
- Appel Claude API avec contexte du portefeuille
- Affichage simple des recommandations

### Phase 2 — Traçabilité 📊
*Objectif : Mesurer la qualité des recommandations*

- Logger chaque suggestion avec date, contexte, raisonnement IA
- Comparaison automatique avec les prix réels post-recommandation
- Dashboard de suivi : score par recommandation
- Historique consultable

### Phase 3 — Optimisation 🧠
*Objectif : Améliorer continuellement la qualité*

- Scoring automatisé des recommandations passées
- Ajustement des prompts selon les patterns d'erreur identifiés
- Alertes sur les biais détectés (ex: surpondération de l'or en période X)
- Rapports de performance hebdomadaires/mensuels

### Phase 4 — Évolution (vision long terme) 🔬
- Fine-tuning d'un modèle sur les données historiques personnelles
- Intégration de courtiers (paper trading automatisé)
- Multi-portefeuilles, multi-profils de risque

---

## 📁 Structure du projet (esquisse)

```
portfolio-ai/
├── frontend/                  # Angular 21
│   ├── src/app/
│   │   ├── dashboard/         # Vue principale du portefeuille
│   │   ├── recommendations/   # Affichage des conseils IA
│   │   ├── history/           # Historique & observabilité
│   │   └── settings/          # Configuration des sources
│
├── backend/                   # Kotlin + Spring Boot
│   ├── src/main/kotlin/
│   │   ├── ingestion/         # Collecte des flux (RSS, APIs)
│   │   ├── analysis/          # Orchestration des appels IA
│   │   ├── portfolio/         # Gestion du portefeuille
│   │   ├── recommendations/   # Stockage & scoring
│   │   └── observability/     # Comparaison suggestion vs réalité
│   └── build.gradle.kts
│
└── docker-compose.yml         # PostgreSQL + services locaux
```

---

## ⚠️ Considérations importantes

- **Ce n'est pas un conseiller financier agréé** — un disclaimer clair sera affiché dans l'application. Les recommandations sont des suggestions basées sur l'analyse de l'IA, pas des conseils financiers certifiés.
- **La qualité dépend des sources** — mieux les flux d'information sont choisis, meilleures seront les analyses.
- **Données personnelles** — le portefeuille est une donnée sensible, la sécurité devra être traitée sérieusement dès le début.

---

## 🧭 Prochaine étape

Démarrer par la **Phase 1 — MVP** :
1. Initialiser le projet Spring Boot avec Gradle (Kotlin DSL)
2. Initialiser le projet Angular 21
3. Définir les entités de base (Portefeuille, Actif, Recommandation)
4. Tester un premier appel Claude API avec un contexte fictif

---

*Document rédigé lors de la session de conception initiale — Avril 2026*
