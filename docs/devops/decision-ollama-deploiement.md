# Décision — déploiement Ollama (dev local Mac vs cible serveur)

> **Statut** : ✅ Tranchée le **2026-05-09** — **Option 3 retenue (statu quo Claude-first, Ollama containerisé en CPU dégradé sur Mac)**. La trace ci-dessous garde l'analyse des 3 options pour qu'un futur arbitrage (machine dédiée, contributeurs externes, multi-user) puisse réévaluer sans repartir de zéro.

## Décision retenue — option 3

**Rationale** : la prochaine étape est l'achat d'une clé Anthropic, ce qui va naturellement tirer 95 %+ de l'usage vers Claude (latence 2-5 s vs 60-180 s, qualité narrative supérieure, coût négligeable à l'échelle perso). Ollama redevient un outil de dev — utile pour exercer le pipeline (parsing, validation, retry, futur SSE) sans cramer des appels Claude à chaque itération, et pour tester le runtime config switch `llm.provider: claude → ollama`. Pour ces deux cas, la lenteur CPU sur Mac est acceptable (2-3 narratifs par session de dev, pas une rafale).

**Pourquoi pas option 1 (sortie de Compose + install natif)** : aurait débloqué Metal et rendu Ollama « vraiment utilisable », mais aurait cassé le « clone + `tilt up` = tout marche » qu'on vient de polir avec le panneau État Ollama et l'eject from VRAM. Le coût onboarding ne se justifie pas tant qu'Ollama n'est pas le chemin principal. Philosophie utilisateur : pas envie de sortir des services hors Docker tant qu'on n'y est pas obligé.

**Pourquoi pas option 2 (override Compose)** : over-engineering pour une cible Linux GPU hypothétique — le ticket Phase 5 « Analyse hébergement » 🔴 candidate sur OVH / Hetzner / Scaleway / Lightsail dans la fourchette 5-15 €/mois, aucun GPU à ce prix. Maintenir deux setups parallèles paie une dette qui n'arrivera peut-être jamais.

**Re-trigger pour réévaluer** :
- Achat d'une **machine dédiée** (Linux + GPU, ou Mac Studio destiné à servir l'app à plusieurs) → option 1 ou 2 redeviennent intéressantes.
- Usage Ollama qui dépasse **20 % des sessions** sur 2-3 semaines consécutives → option 1 vaut ses 30 min d'implémentation.
- Distribution du repo à des **contributeurs externes** (Linux + Windows + Mac mélangés) → option 2 redevient pertinente pour rester inclusif.

**Implémentation collatérale** (faite dans la même session, ~20 min) :
- `docs/technique/developpement.md` — paragraphe « Performance Ollama sur Mac » qui documente la limite Metal-via-Docker et redirige vers Claude pour le quotidien.
- `docs/devops/commandes-pratiques.md` — diagnostic enrichi (`docker stats portfolioai-ollama`) pour reconnaître la saturation CPU et la traiter comme un trait connu.
- `docs/technique/architecture.md > Décisions techniques notables` — entrée courte qui formalise le statu quo.

---

## Trace historique — analyse des 3 options

## Contexte

Le 2026-05-07, une analyse narrative sur `qwen2.5:3b` a saturé 9 cores CPU (~918 % `docker stats`) pendant 60–180 s. Cause racine identifiée :

- **Docker Desktop sur Mac = Linux VM virtualisée**.
- Apple n'expose pas Metal dans la VM → Ollama tourne en **CPU pur** dans le container, là où un Mac M-series natif accélère `qwen2.5:3b` 10–20× via Metal.

La philosophie du projet « tout containeriser » (cohérente pour Postgres, le backend Spring, le frontend nginx) **casse** sur Ollama en dev local Mac, sauf à accepter des temps de réponse 10× plus lents et un fan qui hurle.

Trois questions sous-jacentes à clarifier avant de trancher :

1. **Cible Phase 5 ?** Si VPS Linux modeste sans GPU, Ollama y sera CPU aussi → la question Mac vs Linux disparaît, le sujet devient « est-ce qu'on garde Ollama du tout en prod ». Si serveur GPU (AWS p3, OVH avec carte), Ollama containerisé tourne natif et la question est purement dev-local.
2. **Quel % de l'usage projet en mode offline ?** Si 5 % (« je teste sans clé Anthropic une fois par mois »), tolérer la lenteur Mac est acceptable. Si 80 % (« je préfère ne pas dépendre d'une API »), le compromis devient inacceptable.
3. **Single-user / single-Mac longtemps ?** Si oui, optimiser pour le poste personnel. Si on prévoit de distribuer le repo (Linux + Windows + Mac), une option plus inclusive s'impose.

## Options

### Option 1 — Sortir Ollama du `docker-compose.yml` complètement

Installer Ollama en natif macOS (`brew install ollama && brew services start ollama`), pointer `ollama.base-url` sur `http://localhost:11434` (le daemon natif).

| Avantages | Inconvénients |
|-----------|---------------|
| Metal GPU activé → vitesse normale (10–20× perf actuelle) | Un service de plus à gérer hors Tilt |
| Zéro friction perçue côté UX en mode offline | Perd la reproductibilité « clone repo, `tilt up`, tout marche » |
| Aucune dette d'infra | Si on distribue le repo, chaque dev doit installer Ollama natif (sur Linux c'est bien, sur Windows c'est moins clean) |

**Coût implémentation** : ~30 min (retrait Compose + ajustement `ollama.base-url` selon profil).

### Option 2 — Garder Ollama dans Compose pour cible Linux future, override local Mac

Garder `ollama:` dans le `docker-compose.yml` (où NVIDIA Container Toolkit + `--gpus all` font le job sur serveur GPU) **mais** ajouter un Compose override (ou profil Tilt) qui le sort sur Mac.

| Avantages | Inconvénients |
|-----------|---------------|
| Un seul `docker-compose.yml` qui marche en prod Linux + Mac dev | Complexité de config Tilt + override file à maintenir |
| Plus inclusif si on distribue le repo | Risque de drift entre les deux setups (debug d'un bug uniquement sur Mac, etc.) |
| | La cible Linux GPU est hypothétique tant que Phase 5 n'a pas tranché l'hébergement |

**Coût implémentation** : ~1 h (override + Tilt resource conditionnel + doc des deux modes).

### Option 3 — Stick avec Claude par défaut, Ollama optionnel (statu quo)

Aucun changement. C'est déjà la philo Phase 1 (`llm.provider: claude` dans `application.yml`). Si Ollama est juste un fallback offline « si je veux tester sans réseau », tolérer 60–180 s en CPU sur Mac n'est pas dramatique.

| Avantages | Inconvénients |
|-----------|---------------|
| Zéro changement | Les modèles locaux ne sont pas vraiment utilisables en mode quotidien sur Mac dev |
| Alignement avec la décision déjà prise | La friction « Ollama saturé 60-180 s » revient à chaque test offline |
| Simplicité de doc / onboarding | Pas honnête sur les limites du setup actuel — un nouveau dev qui essaye Ollama bute |

**Coût implémentation** : 0. **Coût intellectuel** : reconnaître publiquement que le setup Ollama-in-Docker sur Mac est dégradé (1 paragraphe dans `developpement.md` + un troubleshooting dans `commandes-pratiques.md`).

## Recommandation

**Option 3 par défaut, à reconsidérer si tu confirmes utiliser Ollama au-delà de 20 % de tes sessions.**

Rationale :

1. **Phase 1 est explicitement Claude-first** depuis le début (`llm.provider: claude` est le défaut YAML). La décision « Claude principal, Ollama backup » a déjà été prise et tient toujours — Claude répond en 1–3 s avec une qualité narrative supérieure à `qwen2.5:3b`.
2. **L'incident du 2026-05-07 est un test ponctuel, pas un usage récurrent**. Tu as switché à Ollama pour valider le runtime config v2 (toggle `llm.provider`), pas pour produire des narratifs en série. Optimiser pour ce cas serait sur-investir.
3. **Cibles serveur Phase 5 indécises**. Avant de containeriser pour Linux GPU (option 2), il faut savoir où on déploie. Le ticket Phase 5 « Analyse hébergement » n'a pas encore été tranché — investir maintenant dans une stratégie cross-platform serait précoce.
4. **Single-user single-Mac est l'horizon prévisible**. Si l'app reste perso, l'option la plus pragmatique est le natif (option 1). Mais option 1 a un coût onboarding qui ne se justifie pas tant qu'Ollama n'est pas utilisé tous les jours.
5. **Le coût de l'inaction est borné**. La saturation CPU n'est pas une régression — c'est un trait connu et documenté du setup. Tant qu'on l'écrit clairement quelque part (« Ollama est en CPU mode dans le container Mac, attendre 60-180 s pour un narratif est normal »), un dev qui essaye n'est pas surpris.

## Décision conditionnelle

> Si tu confirmes que **Ollama est ton chemin principal en dev** (≥ 50 % des sessions), bascule en **option 1** : sortie de Compose + install natif + 1 h d'implémentation. Documenter en parallèle dans `developpement.md` que Ollama tourne hors Tilt sur Mac et qu'il faut le démarrer séparément.
>
> Si tu confirmes **Claude principal + Ollama occasionnel** (< 20 %), reste en **option 3** (statu quo) avec :
> - 1 paragraphe ajouté dans `docs/technique/developpement.md` sous une section « Performance Ollama sur Mac » qui documente la limitation Metal-via-Docker.
> - 1 entrée dans `docs/devops/commandes-pratiques.md` sur le diagnostic (`docker stats portfolioai-ollama` quand le narratif rame).

## Sous-questions ouvertes

- [ ] **Quel pourcentage de tes sessions tu lances Ollama** (vs Claude) ? Approximation suffit.
- [ ] **As-tu une cible serveur en tête pour Phase 5** ? OVH GPU / VPS sans GPU / autre ?
- [ ] **Est-ce que tu prévois de distribuer le repo à d'autres devs** (collègue, contrib externe, démo publique) dans les 6 prochains mois ?

Une fois ces 3 questions répondues, l'arbitrage entre options 1 / 2 / 3 devient mécanique.

## Doc à mettre à jour selon la décision

| Décision | Fichiers à éditer |
|----------|-------------------|
| **Option 1** | `docker-compose.yml` (drop service `ollama`), `docs/technique/developpement.md` (instructions install Ollama natif via `brew`), `docs/technique/ops.md` (cible déploiement), `docs/devops/commandes-pratiques.md` (les commandes `docker compose ... ollama` deviennent `brew services` ou équivalent), `Tiltfile` (potentiellement un `local_resource` qui surveille `ollama serve`), `docs/technique/architecture.md > Décisions techniques notables` (entrée courte rappelant le pourquoi). |
| **Option 2** | `docker-compose.yml` (garder service `ollama` pour Linux), nouveau `docker-compose.override.local.yml` (sortie Mac), `Tiltfile` (resource conditionnel), `docs/technique/developpement.md` (deux modes documentés), `docs/technique/architecture.md > Décisions techniques notables` (idem). |
| **Option 3** | `docs/technique/developpement.md` (paragraphe « Performance Ollama sur Mac »), `docs/devops/commandes-pratiques.md` (diagnostic `docker stats`), `docs/technique/architecture.md > Décisions techniques notables` (statu quo formalisé). |

## Trigger

Décision à prendre quand tu réponds aux 3 sous-questions ci-dessus. Tant que la décision n'est pas prise, le statu quo est option 3 par défaut (l'app marche, Ollama est lent en dev Mac mais utilisable comme backup).
