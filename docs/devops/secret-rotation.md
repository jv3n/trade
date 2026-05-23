# Rotation des secrets prod

Procédure step-by-step pour rotater un secret prod (e.g. `google-oauth-client-secret` compromis, ou rotation préventive régulière). Couvre les 5 secrets Secret Manager actifs ; le pattern est identique pour chacun, seul le step « générer une nouvelle valeur » diffère selon le secret.

> **Quand rotater** : (a) **compromis confirmé ou soupçonné** (clé fuite git history, screenshot leaked, employé qui quitte, etc.) — rotation immédiate ; (b) **rotation préventive** trimestrielle ou semestrielle pour les secrets long-lived (Postgres password, OAuth client secret) ; (c) **après un audit qui révèle un secret affiché en clair quelque part** — vérifier d'abord si la fuite est réelle, puis rotation par précaution.

## Inventaire des 5 secrets

| Secret Manager name | Source de génération | Cible runtime |
|---------------------|----------------------|---------------|
| `google-oauth-client-id` | [GCP Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials?project=trade-496613) | `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID` |
| `google-oauth-client-secret` | Même page, bouton **Reset secret** sur le Client ID | `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET` |
| `app-admin-emails` | Édition manuelle (liste emails admin séparés virgule) | `APP_ADMIN_EMAILS` |
| `supabase-db-url` | [Supabase Dashboard → Database settings → Connection string](https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/settings/database) (Session pooler) + Reset DB password à côté | `SPRING_DATASOURCE_URL` |
| `sentry-dsn-backend` | [GlitchTip → projet `portfolioai-backend` → Settings → Client Keys (DSN)](https://app.glitchtip.com/portfolioai/portfolioai-backend) | `SENTRY_DSN` |

## Pattern de rotation — 6 steps

Applicable à n'importe lequel des 5 secrets. Le pattern garde **zéro downtime** : la nouvelle version coexiste avec l'ancienne le temps de la validation, l'ancienne est détruite après confirmation que la nouvelle marche.

### Step 1 — Générer la nouvelle valeur (côté provider)

Va sur la source du secret (cf. table ci-dessus) et génère/copie la nouvelle valeur.

**Cas particuliers** :
- **`google-oauth-client-secret`** : `Reset client secret` invalide instantanément l'ancien côté Google. Donc tu as une fenêtre de **downtime potentiel** entre le reset et le redeploy si les revisions Cloud Run actives utilisent encore l'ancien — à faire en **fenêtre de maintenance** ou hors heures de pointe. Alternative : créer un **2e OAuth Client ID** côté GCP Console, utiliser ses creds, puis supprimer le 1er Client une fois le redeploy validé (zéro downtime mais double client le temps de la rotation).
- **`supabase-db-url`** : si tu reset le password Postgres côté Supabase, **les sessions JDBC actives du container Cloud Run actuel sont fermées immédiatement** — coupe les requêtes en cours. Fenêtre de maintenance obligatoire. Idem alternative : créer un user Postgres secondaire avec un autre password, swap, drop l'ancien après.

### Step 2 — Pousser la nouvelle valeur dans Secret Manager

```bash
echo -n "<NOUVELLE_VALEUR>" | gcloud secrets versions add <secret-name> --data-file=- --project=trade-496613
```

L'utilisation de `stdin` (et pas `--data="..."`) évite que la valeur apparaisse comme argument de `gcloud` → **invisible dans `ps aux`** aux autres users sur la machine. La valeur reste visible dans l'history shell du `echo` lui-même : sur un Mac perso single-user c'est négligeable, sur une machine partagée préférer `gcloud secrets versions add NAME --data-file=- --project=...` seul puis paste + Ctrl+D, ou pré-loader la valeur dans un fichier temp `gcloud ... --data-file=/tmp/secret.txt && rm /tmp/secret.txt`. Secret Manager garde toutes les versions historiques par défaut — la nouvelle devient `latest` automatiquement, l'ancienne reste accessible par numéro de version pour rollback.

**Vérification immédiate** :
```bash
gcloud secrets versions access latest --secret=<secret-name> --project=trade-496613
# → doit echo la nouvelle valeur. Si erreur "permission denied", revoir grant IAM ci-dessous.
```

### Step 3 — Redéployer pour que Cloud Run re-lise le secret

Cloud Run lit les secrets au **boot de la révision**, jamais en runtime — il faut donc créer une nouvelle révision pour que la nouvelle valeur soit injectée. Deux options :

**Option A — Release tag (chemin propre)** :
```bash
# Crée une release patch — workflow deploy.yml redeploy avec la nouvelle valeur secret.
gh release create vX.Y.Z+1 --target master --title "vX.Y.Z+1 — secret rotation" --notes "Rotate <secret-name>"
```

**Option B — No-op service update (urgence sans nouveau tag)** :
```bash
# Touch le service pour forcer une nouvelle révision sans re-build d'image.
gcloud run services update portfolioai \
  --region=northamerica-northeast1 \
  --project=trade-496613 \
  --update-secrets=<ENV_VAR_NAME>=<secret-name>:latest

# Le re-`--update-secrets` sur le même secret crée une nouvelle révision qui re-lit `latest`.
```

Option B est plus rapide (~1 min vs ~3-5 min build) mais sort du release-process documenté — à réserver aux urgences (compromis actif, exploit en cours).

### Step 4 — Smoke test la nouvelle révision

Une fois la nouvelle révision active sur Cloud Run :
1. Vérifier le boot dans les logs :
   ```bash
   gcloud run services logs read portfolioai --region=northamerica-northeast1 --project=trade-496613 --limit=100
   ```
   Pas de `BindException`, pas de `Failed to bind properties under 'spring.security.oauth2.client...'`, pas de `Connection refused` Postgres.
2. **Smoke** via le path qui consomme le secret :
   - `google-oauth-client-*` → login Google sur `https://tickerstory.org` → arrive sur `/dashboard`
   - `app-admin-emails` → login admin → accès `/settings/access-control` (route ADMIN-only)
   - `supabase-db-url` → ouvrir un dossier ticker → narratif persiste dans `ticker_narrative_snapshot`
   - `sentry-dsn-backend` → trigger une exception backend → event arrive dans GlitchTip dashboard

### Step 5 — Destroy l'ancienne version

Une fois la nouvelle version validée en prod (~15-30 min de safety buffer recommandé pour laisser le temps d'observer en cas de régression), supprime l'ancienne version pour éviter tout rollback accidentel sur une valeur compromise :

```bash
# Liste les versions actives
gcloud secrets versions list <secret-name> --project=trade-496613

# Destroy la version compromise (irréversible — la valeur cleartext disparaît, seuls l'ID + le checksum restent en audit log)
gcloud secrets versions destroy <ancien-version-number> --secret=<secret-name> --project=trade-496613
```

**Note** : `destroy` ne supprime pas l'enregistrement (version numérotée reste visible en `state: DESTROYED`), juste le payload. Le numéro de version n'est pas réutilisé. Si l'ancienne valeur est en plus accidentellement encore valide côté provider (cas Google OAuth si on n'a pas cliqué "Reset"), il faut **aussi** la révoquer côté provider.

### Step 6 — Documenter dans `journal-livraisons.md` (ou `CHANGELOG.md`)

Toute rotation prod = une entrée historique. Format minimal :
```markdown
| ✅ Rotation `google-oauth-client-secret` — préventive trimestrielle | Livré YYYY-MM-DD. Ancien secret destroyed (version N), nouveau en version N+1. Trigger : <raison>. Smoke OK : login Google sur prod redirige correctement post-rotation. |
```

L'audit log GCP Secret Manager conserve aussi l'historique automatiquement ([console](https://console.cloud.google.com/security/secret-manager?project=trade-496613)), mais une ligne dans le journal projet rend l'historique grep-able sans accès GCP.

## Cas spécial — Frontend DSN GlitchTip

Le DSN frontend dans `main.ts` est **hardcodé**, pas dans Secret Manager. Rotation = ouvrir GlitchTip → régénérer le DSN → patcher la constante `GLITCHTIP_DSN` dans `frontend/src/main.ts` → commit + tag release → deploy. Plus lourd qu'une rotation Secret Manager (rebuild + redeploy d'image), mais le DSN frontend est **public par design** (visible dans tous les browsers au load) donc la compromission n'a pas le même impact qu'un secret backend : la rotation est rare et planifiée, pas une réponse à un compromis. Si jamais on doit retirer un projet GlitchTip pollué par du noise et créer un nouveau projet `portfolioai-frontend-v2`, la procédure est : (a) créer le nouveau projet GlitchTip, (b) patch DSN dans `main.ts`, (c) tag release. Pas besoin de toucher Secret Manager.

## Failure modes connus

- **Permission denied après `gcloud secrets versions add`** — le caller n'a pas `roles/secretmanager.admin` sur le projet. Fix : ajouter le binding au compte humain admin via `gcloud projects add-iam-policy-binding trade-496613 --member="user:venet.julien@gmail.com" --role="roles/secretmanager.admin"`.
- **Nouvelle révision Cloud Run crash au boot avec `Could not resolve placeholder 'X'`** — la nouvelle version du secret est vide ou mal formatée (e.g. trailing newline). Reset la version : `gcloud secrets versions destroy <new>` + retry avec `echo -n` (sans newline) ou `printf "%s" "$VAL"`.
- **L'ancien client OAuth Google continue à accepter des logins** — c'est normal tant qu'on ne clique pas "Reset client secret" dans GCP Console. Côté Google, l'ancien secret reste valide jusqu'au reset explicit. À ne pas oublier après la rotation Secret Manager si l'objectif est la révocation totale.
