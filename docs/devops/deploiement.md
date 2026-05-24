# Déploiement — choix d'hébergement Phase 5

Analyse fournisseur et plan de mise en prod pour PortfolioAI, écrite à l'amorce de la Phase 5 (mai 2026), **révisée 2026-05-18** suite à deux clarifications utilisateur (constraint #4 « tout l'état infra dans le repo » + LLM prod = Mock + Claude uniquement, pas d'Ollama). Référence opérationnelle pour le ticket suivant « Provisionner et déployer v1 ». Ce document n'engage pas la stack à 5 ans — il fixe le choix v1 et trace les sorties de secours.

Voisin des autres docs devops :

- [`commandes-pratiques.md`](./commandes-pratiques.md) — commandes Docker / Tilt / Postgres / Ollama au quotidien
- [`decision-ollama-deploiement.md`](./decision-ollama-deploiement.md) — pourquoi Ollama reste en CPU dégradé sur Mac
- **`deploiement.md`** *(ce fichier)* — choix d'hébergement Phase 5 + plan migration

Et liens transverses :

- [`../technique/architecture.md`](../technique/architecture.md) — modules, schéma BDD, décisions techniques
- [`../technique/ops.md`](../technique/ops.md) — CI / CD, caching, sécurité, tooling
- [`../technique/providers.md`](../technique/providers.md) — providers externes (Twelve Data, Finnhub, Anthropic, Ollama)

## 1. Contexte et contraintes

Aujourd'hui l'app vit uniquement en local via `tilt up` sur le poste de l'utilisateur principal — aucun accès depuis un autre appareil, aucun moyen d'autoriser quelqu'un d'autre à l'utiliser. La Phase 4 Authentification (Google OIDC + rôles ADMIN/USER + multi-tenant `user_id` FK) a livré le pré-requis bloquant pour un deploy public. Reste à choisir où et comment exposer.

**Contraintes utilisateur** (arbitrées 2026-05-18) :

1. **Le moins cher possible** — personal project, idéalement $0/mo durable, sans s'interdire un palier supérieur si la valeur ops est claire.
2. **Migration facile** — pas de lock-in fort. La stack doit pouvoir bouger vers un autre provider en ~½ journée si le choix v1 déçoit. Concrètement : Dockerfile standard, Postgres standard, **pas de SDK propriétaire dans le code applicatif** (en particulier : pas de `supabase-kt`, juste `DATABASE_URL` Postgres via JDBC).
3. **GitOps strict** — toutes les opérations critiques se font depuis le repo : deploy via pipeline GitHub Actions, releases via GitHub Releases, secrets via GitHub Environments. Aucune action manuelle sur un dashboard tiers (création de service, ajout d'add-on, scaling) ne doit être nécessaire après le bootstrap. Auditabilité = le `git log` est la source de vérité de l'état de la prod.
4. **Tout l'état infra dans le repo** — Dockerfile, fichiers de config provider (Cloud Run YAML / `fly.toml` / Terraform), tout est commité et review-able via `git log`. **PaaS / serverless est *préféré*** pour la charge ops minimale (TLS auto, OS patches gérés, alerting natif), mais une stack VPS + IaC reste éligible si l'écart coût justifie la charge ops. Ce qui est exclu : provisioning manuel via dashboards, scripts shell non-déclaratifs.
5. **LLM provider en prod = Mock + Claude API uniquement** (décision 2026-05-18) — **Ollama est exclu de la prod**. Il reste utilisable en dev local via `tilt up` ; le toggle UI `/settings/configuration > LLM` continue d'exposer l'option mais elle retourne 503 en prod (panneau État Ollama « daemon non joignable »). **Implication majeure** : la stack passe de ~6 GB RAM (avec Ollama qwen2.5:3b) à ~2 GB (backend + Postgres seuls), ce qui réouvre des options serverless type Cloud Run qui ne peuvent pas accueillir Ollama.

**Profil de charge attendu** : single-user au lancement, puis 1-5 utilisateurs autorisés via whitelist email (`APP_ADMIN_EMAILS`). Pas de SaaS ouvert. Pas de trafic continu — l'utilisateur ouvre l'app quelques fois par jour aux heures de marché.

## 2. Short-list candidats

**Critères éliminatoires** — appliqués avant comparaison fine :

- **Pas de free tier durable** → écarté : AWS, Azure (free tier 12 mois seulement puis payant). Pas une option long-terme pour un perso.
- **GitOps natif faible** → écarté : Heroku (prix prohibitifs en 2026, ~$25/mo pour Eco dyno + Postgres) ; AWS Lightsail (interface web obligatoire pour beaucoup d'opérations, contrainte #3 violée).
- **Pas de région Eastern Canada / US-East proche** → pénalisé mais non éliminatoire : la latence Montréal → Europe (~80-100 ms) reste acceptable pour cet usage, mais Toronto / Virginia (~5-30 ms) est préférable.

**Quatre candidats survivent** :

- **Google Cloud Run + Supabase Postgres** — serverless managé total, $0/mo durable, région Montréal native côté compute, Supabase Toronto (`ca-central-1`) côté DB.
- **Fly.io Phase 5a** — PaaS Docker-first single-vendor, ~$10/mo, région `yyz` Toronto.
- **Oracle Cloud A1 Ampere** — VM ARM 4 OCPU/24 GB Always Free, région `ca-montreal-1`, sysadmin léger récurrent.
- **Railway / Render** — alternatives PaaS US-East, $5-13/mo, latence pénalisée vs Cloud Run et Fly.

## 3. Tableau de comparaison

Prix relevés 2026-05-18. Vérifier les pages officielles avant provisioning — ils bougent régulièrement.

| Critère | **Cloud Run + Supabase** | Fly.io Phase 5a | Oracle A1 Ampere | Railway / Render |
|---|---|---|---|---|
| **Coût mensuel** | **$0** (durable dans free tier) | ~$10 (backend $5.7 + Postgres unmanaged $7.20) | **$0** (Always Free) | $5-13 |
| **Région la plus proche de Montréal** | `northamerica-northeast1` (Montréal natif) ~5 ms compute, Supabase DB Toronto (`ca-central-1`) ~5-10 ms | `yyz` (Toronto) ~5 ms | `ca-montreal-1` ~5 ms | US-East ~25 ms |
| **Quota backend** | 2M req/mo + 360K GB-s + 180K vCPU-s + 1 GB egress N. America/mo | shared-cpu-1x@1GB scale-to-zero | 4 OCPU ARM + 24 GB RAM + 200 GB block + 10 TB egress | Métré |
| **Postgres** | **Supabase free** 500 MB DB + 50K MAU + 2 GB transfer + auto-pause après 7j inactivité | Fly Postgres unmanaged 1 GB + 10 GB volume | Self-hosted dans la VM (gratuit illimité) | Inclus tier |
| **Scale-to-zero** | ✅ natif (cold-start 1-3 s) | ✅ `auto_stop_machines = "stop"` | ❌ VM toujours-on (reclamation 7j idle si pas PAYG) | ❌ |
| **GitOps + Releases** | ✅ `google-github-actions/auth@v3` + Workload Identity Federation (pas de key long-lived) + `gcloud run deploy` | ✅ `superfly/flyctl-actions@v1.5` + `FLY_API_TOKEN` | ✅ Terraform OCI + ssh deploy via cloud-init | ✅ |
| **TLS + custom domain** | Via Cloudflare devant (gratuit) ou Cloud Run custom domain mapping (gratuit) | `flyctl certs add` + CNAME, Let's Encrypt auto | Caddy containerisé + Let's Encrypt (à câbler) | Inclus |
| **Sysadmin récurrent** | **Aucun** (full managed) | Aucun (PaaS) | ~30 min/mois (`unattended-upgrades`, monitoring, restore drill) | Aucun |
| **Risque free tier shrink (2-3 ans)** | Modéré côté Supabase (VC startup), faible côté Google (Cloud Run GA stable depuis 2019) | Faible (mais c'est déjà payant) | Modéré (terms évolués 2× depuis 2021) | Modéré |
| **Lock-in** | Faible — Postgres standard + Dockerfile + Cloud Run service.yaml ~30 lignes (mais discipline « zéro SDK Supabase » à tenir) | Faible — Dockerfile + `fly.toml` ~30 lignes | Faible — Dockerfile + docker-compose + module Terraform OCI ~80 lignes | Faible |
| **Migration sortie estimée** | ~2-3 h vers Fly / Neon / Oracle / VPS | ~3-4 h | ~3-4 h | ~3-4 h |

Sources brutes :
- Google Cloud Run — [pricing](https://cloud.google.com/run/pricing) + [free tier](https://cloud.google.com/free) + [GitHub Actions auth](https://github.com/google-github-actions/auth)
- Supabase — [pricing](https://supabase.com/pricing) + [auto-pause policy](https://supabase.com/docs/guides/platform/billing-on-supabase#how-does-the-free-plan-work)
- Fly.io — [pricing](https://fly.io/docs/about/pricing/) + [Fly Postgres unmanaged](https://fly.io/docs/postgres/) + [continuous deployment](https://fly.io/docs/launch/continuous-deployment-with-github-actions/)
- Oracle — [Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) + [hitrov/oci-arm-host-capacity](https://github.com/hitrov/oci-arm-host-capacity)
- Cloudflare — [R2 free tier](https://developers.cloudflare.com/r2/pricing/) (10 GB storage) + custom domain proxy gratuit

## 4. Recommandation — Cloud Run + Supabase Postgres

**Choix retenu : Google Cloud Run (compute) + Supabase Postgres (DB)**. Quatre arguments décisifs :

1. **$0/mo durable** — Cloud Run free tier (2M req + 360K GB-s + 180K vCPU-s + 1 GB egress N. America) couvre un usage single-user 1000× ; Supabase free (500 MB DB + 50K MAU) couvre tout le modèle PortfolioAI single-user (~50 MB de données prévisibles). Pas un free trial 12 mois — un free tier qui tient depuis 2019 (Cloud Run) et qui a globalement **augmenté** 2020-2026 (Supabase).
2. **Région Montréal native côté compute** — Google a un datacenter physique à Montréal (`northamerica-northeast1`). Latence TTL ~5 ms. La DB Supabase est en Toronto (`ca-central-1`, Session pooler IPv4), ~5-10 ms RTT par requête, invisible à l'usage single-user.
3. **Charge ops récurrente = zéro** — Cloud Run gère scale-to-zero, OS patches, TLS Cloud Run, alerting natif. Supabase gère backups Postgres quotidiens (rétention 7j en free), patches PG, monitoring. Aucun cron à câbler pour la maintenance routinière (on en câble UN, pour le backup d'exit cf. §5).
4. **Lock-in cosmétique** — code applicatif n'a aucune dépendance Supabase-specific (uniquement `DATABASE_URL` JDBC standard) ni Cloud Run-specific (Dockerfile multi-stage classique). Migration sortie = `pg_dump | pg_restore` vers Neon free + redeploy ailleurs = ~2-3 h.

**Concessions assumées** :

- **Latence DB cross-région minime** — Supabase région Toronto (`ca-central-1`) retenue au provisioning au lieu de US-East (default Supabase) parce que disponible en free tier et proche de Cloud Run Montréal. ~5-10 ms RTT par requête (vs ~25 ms si on était resté US-East), négligeable même cumulé. Le mode **Session pooler** `aws-1-ca-central-1.pooler.supabase.com:5432` est retenu vs Direct (IPv6-only, incompatible Cloud Run) vs Transaction pooler (port 6543, casse les advisory locks Flyway au boot).
- **Cold-start Cloud Run ~1-3 s** — scale-to-zero forcé en free tier. La 1ère requête après ~15 min d'inactivité paye un cold-start. Acceptable single-user qui ouvre l'app quelques fois par jour.
- **Supabase auto-pause après 7j inactivité** — re-réveille à la 1ère requête (~10-20 s). Invisible quotidien, sensible après vacances. Mitigation = cron ping (5 lignes de GitHub Actions schedule) si jamais.
- **Multi-vendor stack** — 2 dashboards (GCP Console + Supabase) à regarder si quelque chose pète. Mitigé par scope clair : Cloud Run = compute, Supabase = data. Acceptable pour les $120/an économisés vs Fly.

**Pourquoi pas Fly Phase 5a ($10/mo)** : single-vendor + DX excellent mais $120/an pour exactement les mêmes capacités qu'un setup $0/mo bien câblé. La consolidation single-vendor n'est plus une plus-value décisive maintenant qu'Ollama est hors prod (le scenario Phase 5b qui justifiait $35/mo Fly disparaît). Reste un **fallback légitime** si Cloud Run + Supabase déçoit.

**Pourquoi pas Oracle A1 Ampere ($0)** : sans Ollama, les 24 GB ARM deviennent massivement overkill (~2 GB utilisés sur 24). Et c'est exactement ce qui déclenche la reclamation 7j idle (CPU < 20 % 95p) — mitigeable par upgrade PAYG mais on garde la sysadmin légère récurrente. Reste un fallback si l'écart $0 vs $120/yr vaut la sysadmin (et si tu veux garder l'option Ollama future sans re-migrer).

**Pourquoi pas VPS + Terraform (Hetzner CX22 ~$5/mo)** : éligible depuis la clarification contrainte #4 mais sans Ollama, l'avantage RAM/coût ne joue plus, et la latence Falkenstein ~100 ms reste pénalisante. Sortirait si on voulait apprendre les Linux ops.

## 5. Plan phasé — du bootstrap à la prod stable

### Phase 5a — Bootstrap ($0/mo)

**Objectif** : exposer l'app sur internet avec auth Google fonctionnelle, sans Ollama, sans monitoring sophistiqué. Premier deploy testable depuis un autre appareil.

| Composant | Setup | Coût |
|---|---|---|
| Backend Spring Boot + Angular static | 1 Cloud Run service `portfolioai` région `northamerica-northeast1`, image Docker `linux/amd64` poussée sur Artifact Registry, scale-to-zero | $0 (sous free tier) |
| Postgres | Projet Supabase `portfolioai-prod` (free tier, région `ca-central-1` Toronto, Session pooler IPv4) | $0 (sous free tier) |
| Frontend | Build Angular embarqué dans le jar Spring Boot (`static/`) — pas de service séparé | $0 |
| Auth | Google OIDC déjà câblé Phase 4 (juste re-enregistrer la redirect URI `https://portfolioai-*.run.app/login/oauth2/code/google` côté Google Cloud Console) | $0 |
| Secrets runtime | GCP Secret Manager — 5 secrets en prod : `google-oauth-client-id`, `google-oauth-client-secret`, `app-admin-emails`, `supabase-db-url`, `sentry-dsn-backend` (ajouté Phase 5b). Montés au runtime via `--update-secrets` du `gcloud run deploy`. **La clé Anthropic n'est PAS un secret Secret Manager** — elle vit dans la table `app_config` (DB runtime, settable via `/settings/configuration` UI) | $0 (sous free tier Secret Manager) |
| Backup weekly | Workflow `.github/workflows/backup-postgres.yml` `cron '0 4 * * 0'` (dimanche 4 AM UTC) qui exécute `pg_dump $SUPABASE_DATABASE_URL` et upload vers Cloudflare R2 bucket `portfolioai-backups` (free tier 10 GB). Rétention 30 backups (~7 mois d'historique). Détail dans [`backup-process.md`](./backup-process.md). | $0 |
| **Total Phase 5a** | | **$0/mo** |

**Provider LLM en 5a** : `mock` par défaut au boot (assure que l'app boote même sans clé Anthropic). Basculable vers `claude` via `/settings/configuration` UI dès que la clé est posée dans le slot SECRET runtime (table `app_config`). Pattern différent des 5 secrets boot-time : la clé Anthropic est éditable runtime sans redéploiement (cohérence avec les clés Twelve Data / Finnhub aussi runtime-editable). **Ollama indisponible en prod** : la UI affiche l'option mais la sélection retourne 503.

### Phase 5b — Hardening prod ($0/mo encore)

**Trigger** : après que la Phase 5a soit stable ~1 semaine.

| Composant additionnel | Setup | Coût |
|---|---|---|
| Domain + TLS | **Domaine `tickerstory.org`** via Cloudflare Registrar (~$7.50/an at-cost). **Worker Cloudflare** `tickerstory-proxy` devant Cloud Run (le native domain mapping Cloud Run n'est pas dispo en `northamerica-northeast1` → pivot Worker). TLS Cloudflare auto (pas Let's Encrypt — Cloudflare émet via sa propre CA). Cf. [`dns-analyse.md`](./dns-analyse.md) pour le choix du nom + TLD, et `architecture.md > Décisions Phase 5 > Worker Cloudflare` pour le wiring complet | ~$7.50/an domaine + $0 Worker/TLS |
| Cache + bypass egress | 2 Cache Rules Cloudflare : `Bypass cache for API` (`/api/*`) + `Cache static assets aggressively` (`URI File Extension is in {js, css, woff…}` + Edge/Browser TTL 1 year). Les hits cache ne comptent pas dans le quota egress Cloud Run free 1 GB/mo | $0 |
| Monitoring uptime | **UptimeRobot free tier** — HTTP polling externe toutes les 5 min sur `/actuator/health`. Pivot Healthchecks.io → UptimeRobot parce que Healthchecks.io free est dead-man's-switch (l'app ping, alerte si manquant) incompatible avec Cloud Run scale-to-zero | $0 |
| Error tracking | **GlitchTip SaaS free tier** (5K events/mo) — serveur d'ingestion Sentry-API-compatible. Pivot Sentry → GlitchTip parce que le free Developer plan Sentry est caché derrière un trial Business $89/mo. Backend `io.sentry:sentry-spring-boot-starter-jakarta:8.10.0`, frontend `@sentry/browser` (le package `@sentry/angular` cape à Angular 19, incompatible avec notre Angular 21). DSN backend dans Secret Manager (`sentry-dsn-backend`), DSN frontend hardcodé `main.ts` (public par design) | $0 |
| **Total Phase 5b** | | **~$7.50/an** (domaine) |

### Phase 5c — Si free tier serre (~$25-30/mo)

**Trigger** : Supabase pause/restrict OU Cloud Run egress dépassé OU multi-user authentifié devient une réalité.

Trois sorties propres dans l'ordre de préférence :

1. **Migrer Supabase → Neon free** (`pg_dump | pg_restore`, ~30 min) — reste $0/mo si Cloud Run tient. Plan A.
2. **Upgrade Supabase Pro $25/mo** — backups 30j, no auto-pause, 8 GB DB. Plan B si Neon ne tient pas non plus.
3. **Bascule globale vers Fly Phase 5a $10/mo** — si Cloud Run + Supabase deviennent instables ensemble. Plan C, dernier recours.

À filer en backlog Phase 5+ une fois 5a/5b stables.

## 6. Pipeline GitOps — GitHub Actions → Cloud Run

**Principe** : `git push --tags` + créer une GitHub Release = le seul geste manuel acceptable. Tout le reste tourne en CI. Aucun click sur `console.cloud.google.com`. Aucun `gcloud run deploy` depuis un poste local en prod (le dev local utilise `gcloud` la première fois pour bootstrap, mais après c'est CI-only).

### 6.1 Setup initial (one-shot, ~2 h)

1. Créer un projet GCP `portfolioai` (geste manuel inévitable). Activer les APIs : Cloud Run, Artifact Registry, Secret Manager, IAM Service Account Credentials.
2. Créer un repo Artifact Registry Docker `northamerica-northeast1-docker.pkg.dev/portfolioai/backend`.
3. Créer un service account `github-deploy@portfolioai.iam.gserviceaccount.com` avec rôles **project-level** `roles/run.admin` + `roles/iam.serviceAccountUser` + `roles/artifactregistry.writer`. **Pas** de `roles/secretmanager.secretAccessor` au project level — le binding sur ce rôle est **per-secret** (moindre privilège, cf. [`backup-process.md`](./backup-process.md) §3). Aujourd'hui seul `supabase-db-url` est granté à `github-deploy@` (pour le pipeline backup) ; les 4 autres secrets (`google-oauth-client-id`, `google-oauth-client-secret`, `app-admin-emails`, `sentry-dsn-backend`) sont réservés au SA runtime `portfolioai-runtime@`. La commande type : `gcloud secrets add-iam-policy-binding <SECRET> --member=serviceAccount:github-deploy@... --role=roles/secretmanager.secretAccessor --project=trade-496613` — à exécuter uniquement sur les secrets que `github-deploy@` a besoin de lire (donc aujourd'hui seulement `supabase-db-url`).
4. Configurer **Workload Identity Federation** GitHub OIDC ↔ GCP (suit la procédure officielle [google-github-actions/auth#setting-up-workload-identity-federation](https://github.com/google-github-actions/auth#setting-up-workload-identity-federation)). Sortie : `projects/<num>/locations/global/workloadIdentityPools/github/providers/github`. **Pas de service account JSON key** à manipuler — Workload Identity échange un OIDC token court-terme par run.
5. Pousser les 5 secrets runtime dans Secret Manager via stdin (jamais en clair dans `--data="..."`) : `google-oauth-client-id`, `google-oauth-client-secret`, `app-admin-emails`, `supabase-db-url`, `sentry-dsn-backend`. Pattern : `echo -n "<valeur>" | gcloud secrets create <nom> --data-file=- --project=trade-496613` puis grant per-secret au runtime SA `portfolioai-runtime@` (one-shot, ~5 min). Détail + procédure de rotation dans [`secret-rotation.md`](./secret-rotation.md).
6. Côté Supabase : créer le projet `portfolioai-prod`, exécuter le V1 Flyway via le SQL Editor (ou laisser Spring Boot le faire au 1er boot via Flyway `baseline-on-migrate: true`), récupérer la `DATABASE_URL` et la pousser dans GCP Secret Manager comme `supabase-db-url`.
7. Côté GitHub : créer l'environment `production` avec `required reviewers` + 3 variables environment-scoped `GCP_PROJECT=portfolioai`, `GCP_WIF_PROVIDER=projects/.../providers/github`, `GCP_SA_EMAIL=github-deploy@...`. **Dupliquer aussi ces 3 vars au repo level** (`gh variable set GCP_PROJECT --body ...`, idem pour les 2 autres) — le workflow `backup-postgres.yml` ne déclare PAS `environment: production` (un cron à 4h du matin qui attendrait un required-reviewer approval ne tient pas), il lit donc les vars repo-level. Les jobs déploy continuent de lire en priorité les versions env-scoped quand ils déclarent `environment: production`. Coexistence propre des deux scopes.

### 6.2 Workflow `.github/workflows/deploy.yml`

**Livré 2026-05-18.** Source : [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml). Rituel d'utilisation (tag → Draft Release → Publish → approve environment → smoke) détaillé dans [`release-process.md`](./release-process.md).

**Décisions ancrées** (figées au moment de la livraison) :
- **Trigger sur `release: published`, pas `push` master** → la release est l'acte conscient ; les pushes master continuent de bouger CI mais ne deploient pas. Évite les deploys accidentels sur un commit cassé.
- **`environment: production`** → permet de configurer `required reviewers` côté GitHub (= l'utilisateur s'auto-approve, mais c'est documenté et auditable).
- **Workload Identity Federation** (`id-token: write` permission) → pas de service account JSON key dans GitHub Secrets. Chaque run échange un OIDC token court-terme.
- **`--update-secrets`** → Cloud Run mount les 5 secrets depuis Secret Manager au runtime comme env vars. Pas de secret en clair dans le manifest.
- **`linux/amd64` seulement** → Cloud Run tourne sur x86, pas besoin de multi-arch (économise l'overhead QEMU emulation côté GitHub runner).
- **`--allow-unauthenticated`** → Cloud Run laisse passer toutes les requêtes ; l'auth Spring Security côté app gère les 401. (Alternative : `--no-allow-unauthenticated` + IAM users — overkill pour single-user.)

### 6.3 Workflow backup weekly `.github/workflows/backup-postgres.yml`

**Livré 2026-05-18.** Source : [`.github/workflows/backup-postgres.yml`](../../.github/workflows/backup-postgres.yml). Setup pré-requis (R2 bucket + 3 GH secrets + 3 GH vars repo-level + grant **per-secret** `secretmanager.secretAccessor` au SA deploy sur **`supabase-db-url` uniquement**) + rituel + restore drill trimestriel : [`backup-process.md`](./backup-process.md).

**Pourquoi backup weekly explicite alors que Supabase fait des backups quotidiens en free** : (a) **Discipline d'exit** — si Supabase serre/disparaît, on a un `.sql.gz` à restorer ailleurs sans dépendre de leur API. (b) **Format `pg_dump` standard**, restorable n'importe où (Neon, Fly Postgres, VPS) vs format Supabase-proprio des snapshots managés. (c) **Cadence weekly retenue** (vs daily envisagé initialement) — Supabase fait déjà du quotidien 7j en parallèle (filet court), notre R2 est le filet long-terme (30 backups = ~7 mois d'historique). Worst-case data loss : 7j. Mitigation : `gh workflow run backup-postgres.yml` à la demande avant une opération risquée (migration schema, fix SQL).

### 6.4 Surface de version — `/actuator/info`

**Livré 2026-05-23, post-clôture Phase 5.** Décision et trade-offs dans [`architecture.md > Décisions Phase 5 > Version surface`](../technique/architecture.md#phase-5--déploiement). Cette section documente le pipeline et le payload pour debug en prod.

**Endpoint** : `GET https://tickerstory.org/actuator/info` (public, non-authentifié — pas de PII, info purement build/git). Exposé via `management.endpoints.web.exposure.include: health, info` dans `application-prod.yml`.

**Payload type post-deploy** :
```json
{
  "build": {
    "artifact": "backend",
    "name": "backend",
    "group": "com.portfolioai",
    "version": "v0.8.0-rc1",
    "time": "2026-05-23T14:32:11.000Z"
  },
  "git": {
    "branch": "master",
    "commit": {
      "id": "fcd0b5c7e9a1b2c3d4e5f6789abcdef0123456789",
      "id.abbrev": "fcd0b5c",
      "time": "2026-05-23T13:55:00Z",
      "message": { "short": "docs: align doc-set after Phase 5 closure (audit punch-list)" }
    },
    "tags": "v0.8.0-rc1"
  }
}
```

**Pipeline** :

1. **Build tooling** (`backend/build.gradle.kts`) — deux plugins coordonnés :
   - `springBoot { buildInfo() }` → génère `META-INF/build-info.properties` (consommé par `BuildInfoContributor`).
   - Plugin `com.gorylenko.gradle-git-properties:2.4.2` → génère `META-INF/git.properties` (consommé par `GitInfoContributor`). `dotGitDirectory.set(file("../.git"))` parce que le projet Gradle vit dans `backend/`. `failOnNoGitDirectory = false` pour ne pas casser un build hors-git. `keys = ["git.branch", "git.commit.id", "git.commit.id.abbrev", "git.commit.time", "git.commit.message.short", "git.tags"]`.
   - `management.info.git.mode: full` dans `application.yml` (sinon Spring n'expose que branch + commit.id + commit.time même si le fichier en contient plus).

2. **Version** (`build.gradle.kts` ligne `version = …`) — lue depuis la property gradle `version` avec fallback `0.0.0-SNAPSHOT` :
   ```kotlin
   version = (project.findProperty("version") as? String)
     ?.takeIf { it.isNotBlank() && it != "unspecified" } ?: "0.0.0-SNAPSHOT"
   ```
   Le CI passe `-Pversion=$APP_VERSION` au gradle build dans le Dockerfile.

3. **Dockerfile** (`devops/prod/Dockerfile`) — deux ajouts dans le stage `backend-builder` :
   - `ARG APP_VERSION=0.0.0-SNAPSHOT` (recevoir le build-arg du CI).
   - `COPY .git/ ./.git/` (sinon `gradle-git-properties` ne trouve pas le repo et la section `info.git` reste vide).
   - `RUN cd backend && ./gradlew --no-daemon bootJar -x test -Pversion=$APP_VERSION` (propager la version).

4. **CI workflow** (`.github/workflows/deploy.yml`) — deux ajouts :
   - `actions/checkout@v4` avec `fetch-depth: 0` (le défaut shallow `depth: 1` n'expose ni les tags annotés ni l'historique → `git.tags` serait vide).
   - `docker/build-push-action@v6` avec `build-args: APP_VERSION=${{ github.event.release.tag_name }}`.

**Source de vérité unique** : le tag GitHub Release (`v0.7.0`, `v0.7.0-rc1`) propage simultanément à 5 surfaces :

| Surface | Provenance |
|---|---|
| Image Docker Artifact Registry | `tags: …/portfolioai:${{ github.event.release.tag_name }}` |
| Label OCI `image.version` | `labels: org.opencontainers.image.version=…` |
| Env var `SENTRY_RELEASE` (events GlitchTip) | `--set-env-vars=SENTRY_RELEASE=${{ github.event.release.tag_name }}` |
| `/actuator/info > build.version` | `build-args: APP_VERSION=…` → `-Pversion=…` → `build-info.properties` |
| `/actuator/info > git.tags` | `gradle-git-properties` lit le tag courant via `git describe --tags` |

Un changement de tag = 5 surfaces synchronisées sans aucune saisie manuelle.

**Notes pratiques** :
- Le `v` initial du tag (`v0.7.0` plutôt que `0.7.0`) est conservé tel quel dans `build.version` pour cohérence cross-surface. Si tu veux dropper le `v`, ajoute un `sed 's/^v//'` au workflow avant de propager `APP_VERSION`.
- Build local sans `-Pversion` (Tilt dev) → `build.version = "0.0.0-SNAPSHOT"`, `git.*` rempli normalement parce que `.git` est présent au workspace.
- `COPY .git/` coûte ~70 MB de build context local. Sur CI le shallow clone d'origine est étendu via `fetch-depth: 0` (~quelques MB pour ce repo solo). À reconsidérer si le repo grossit beaucoup et que les builds Docker ralentissent notablement.

## 7. Plan de migration — sortir de Cloud Run + Supabase si besoin

Lock-in à inventorier précisément pour respecter la contrainte #2 :

| Composant | Cloud Run / Supabase specific ? | Effort migration |
|---|---|---|
| Code applicatif Kotlin + Spring | Aucun | $0 |
| `Dockerfile` | Standard multi-stage Eclipse Temurin + Gradle | $0 |
| `service.yaml` Cloud Run (généré par `gcloud run deploy --format yaml`) | Oui — ~30 lignes (image, env vars, secrets, scaling) | ~1 h à traduire vers `fly.toml` / `railway.toml` / `docker-compose.prod.yml` |
| Postgres Supabase | **Standard PG 15, aucune extension Supabase-specific** | `pg_dump | pg_restore` vers Neon / Fly Postgres / RDS — ~30 min |
| Auth Google OAuth | Spring Security via JDBC standard | Aucun changement code ; juste mettre à jour la redirect URI Google Cloud Console |
| Secrets Cloud Run | GCP Secret Manager via `--update-secrets` | Re-pusher dans `flyctl secrets` / Railway env vars — ~30 min |
| TLS + custom domain | Cloudflare CNAME (provider-agnostic) | rien à migrer |
| Backups | GitHub Actions cron → R2 (provider-agnostic) | rien à migrer |
| Monitoring (si Sentry câblé) | Provider-agnostic | rien à migrer |
| **Total migration** | | **~2-3 h** pour bouger vers Fly / Railway / Oracle |

**Discipline non-négociable** pour préserver la migrabilité :
- **Zéro SDK Supabase** dans le code applicatif (`build.gradle.kts` ne contient aucune dépendance `supabase-*`). Uniquement `DATABASE_URL` JDBC standard.
- **Zéro SDK Cloud Run-specific** côté code (pas de `@google-cloud/run` ni d'usage de `K_SERVICE` / `K_REVISION` env vars sauf logging).
- **Backup nocturne actif dès le 1er deploy**, pas dans 6 mois.

**Trigger migration** : (a) facture Supabase Pro forcée > $25/mo, (b) Cloud Run egress dépassé répétitivement (signal qu'on a vraiment du trafic), (c) instabilité free tier répétée (>2 pauses inopinées/an).

## 8. Risques et trade-offs

**Supabase free tier shrinks à 2-3 ans** — risque modéré (VC startup needs monetization). Historique 2020-2026 plutôt favorable (le free tier a globalement augmenté). Worst case : DB passe à 250 MB ou auto-pause à 3j. Mitigation = backup nocturne + migration vers Neon free en 30 min.

**Cloud Run egress 1 GB/mo N. America** — borné par le trafic single-user (~90 MB/mo estimé). À surveiller si on ouvre à plus d'users. **Mitigation = Cloudflare devant** dès Phase 5b (cache statique + assets servis depuis Cloudflare edge, bypass du quota Cloud Run).

**Supabase auto-pause après 7j inactivité** — invisible single-user qui ouvre l'app quotidiennement ; sensible après vacances (la 1ère requête au retour peut prendre ~10-20 s pour réveiller la DB). Mitigation simple si gênant = un cron GitHub Actions `schedule: '0 12 * * 0'` qui ping `SELECT 1` chaque dimanche pour garder vivant.

**Multi-vendor stack = 2 dashboards à observer** — Cloud Run + Supabase au lieu d'un seul Fly. Atténué par scope clair (compute vs data) et par incidents rares à cette échelle. Le prix à payer pour les $120/an économisés.

**Latence DB cross-région minime (~5-10 ms RTT)** — Supabase région Toronto (`ca-central-1`) en Session pooler IPv4. ~5-10 ms RTT par requête, négligeable même cumulé. Le risque initial estimé à 2026-05-18 (~25 ms US-East par défaut) ne s'est pas matérialisé parce qu'on a choisi `ca-central-1` au provisioning.

**Cold-start Cloud Run ~1-3 s** — la 1ère requête après ~15 min d'inactivité paye le cold-start. Acceptable single-user, frustrant si beaucoup d'utilisateurs occasionnels.

**Workload Identity Federation setup non-trivial** — la 1ère config GCP est ~30 min (créer Workload Identity Pool + Provider + binding au service account). Bien documenté mais pas as-simple-as `FLY_API_TOKEN`. Cf. ticket GitHub Secrets vault qui couvrait déjà cette approche en théorie.

## 9. Tickets dépendants

> **Note 2026-05-23** : Phase 5 entièrement clôturée. Tous les tickets ci-dessous sont livrés, l'historique d'exécution (pivots, gotchas, effort réel) vit dans [`journal-livraisons.md > Phase 5`](../projet/journal-livraisons.md#phase-5--déploiement-clôturée-2026-05-23). Liste gardée ici comme **trace du plan initial** vs la réalisation.

1. **Provisionner et déployer v1 (Phase 5a)** ✅ — créer projet GCP, configurer Workload Identity Federation, créer projet Supabase, écrire `Dockerfile` multi-stage backend, faire le 1er deploy manuel via `gcloud run deploy`, valider end-to-end (login Google OAuth + dashboard + ouverture dossier ticker avec Mock LLM). Livré 2026-05-18 en 5 itérations Docker.
2. **Câbler le workflow GitHub Actions deploy** ✅ — décrit en §6.2 ci-dessus. Livré 2026-05-18 (`v0.7.0-rc1` smoke).
3. **Backup Postgres weekly → Cloudflare R2** ✅ — workflow + R2 bucket + premier restore drill. Livré 2026-05-18.
4. **Cloudflare devant Cloud Run** ✅ — custom domain `tickerstory.org` + TLS + cache + bypass egress. Livré 2026-05-22 (custom domain) → 2026-05-23 (Cache Rules + smoke). 3 pivots vécus (Cloud Run regional domain-mapping indispo Montréal, Origin Rules Enterprise-only, X-Forwarded-Host strip).
5. **Monitoring uptime + Sentry** ✅ — UptimeRobot HTTP polling + GlitchTip SaaS (pivot Sentry → GlitchTip + pivot `@sentry/angular` → `@sentry/browser`). Livré 2026-05-23 sous tag `v0.8.0-rc1`.

Les tickets *hardening* (OAuth secret management + `server.forward-headers-strategy`) ✅ livrés 2026-05-23 par documentation explicite : `architecture.md > Décisions Phase 5 > Forward-headers strategy` + `> Secret management` + nouveau [`secret-rotation.md`](./secret-rotation.md). Le ticket « GitHub Secrets + Environments vault » ✅ livré 2026-05-18 avec le pipeline Workload Identity Federation décrit en §6.

## 10. Décisions clés — résumé

| Décision | Choix | Pourquoi |
|---|---|---|
| **Compute** | **Google Cloud Run** région `northamerica-northeast1` | Serverless managé, scale-to-zero natif, Montréal native, $0/mo durable |
| **Database** | **Supabase Postgres** free tier (région Toronto `ca-central-1`, Session pooler IPv4) | $0/mo durable, Postgres standard (pas de SDK Supabase) |
| **Frontend** | Servi par le backend (build Angular embarqué dans le jar) | Économise 1 service, simplifie CORS + cookies session |
| **TLS + DNS** | Cloudflare gratuit devant Cloud Run | Custom domain + cache + bypass egress quota Cloud Run free |
| **LLM provider** | Mock + Claude API uniquement | Ollama exclu prod (décision user 2026-05-18) |
| **Backups Postgres** | Cron GitHub Actions nocturne `pg_dump` → Cloudflare R2 (free 10 GB) | Discipline d'exit propre indépendante de Supabase |
| **Secrets runtime** | GCP Secret Manager + Workload Identity Federation | Pas de service account key long-lived dans GitHub |
| **Multi-arch Docker** | `linux/amd64` only | Cloud Run x86, ARM Ampere écarté avec Oracle |
| **GitOps** | `on: release: published` → `gcloud run deploy` | Acte conscient via GitHub Release, jamais sur push master |
| **Migration sortie** | Dockerfile standard + Postgres standard | ~2-3 h vers Fly / Neon / Oracle / VPS |
| **Fallback documenté** | Fly Phase 5a ($10/mo) ou Oracle A1 ($0 + sysadmin léger) | Triggers : Supabase pause répétitif, ou Cloud Run egress dépassé soutenu |
