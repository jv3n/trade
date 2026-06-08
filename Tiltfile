# PortfolioAI — Tiltfile

load("ext://uibutton", "cmd_button")

# Hôte réseau (override avec: tilt up -- --host=192.168.18.13)
config.define_string("host", args=False, usage="Network host (e.g. 192.168.18.13)")
cfg = config.parse()
host = cfg.get("host", "localhost")

# ────────────────────────────────────────────────
# Ports — chargés depuis .env (gitignored) avec fallback sur les défauts
# ────────────────────────────────────────────────
#
# Si le fichier `.env` existe à la racine du repo, on le lit pour récupérer les overrides
# de port (POSTGRES_HOST_PORT / OLLAMA_HOST_PORT / BACKEND_HOST_PORT / FRONTEND_HOST_PORT).
# Sinon on retombe sur les défauts. Cf. `.env.example` pour le template.
#
# Docker Compose lit `.env` automatiquement pour ses propres substitutions `${VAR:-default}` ;
# on duplique la lecture ici parce que Tilt n'auto-charge pas `.env` dans son env Starlark
# et qu'on a besoin des valeurs pour (a) les links UI Tilt, (b) injecter dans les serve_cmd
# qui exécutent backend (Spring) et frontend (Angular).

def load_env_file(path):
    """Reads `.env` if present, returns a {key: str} dict. Skips comments and blank lines."""
    if not os.path.exists(path):
        return {}
    out = {}
    for raw_line in str(read_file(path)).splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        # Strip optional surrounding quotes — `KEY="value"` and `KEY='value'` accepted.
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out

env = load_env_file(".env")

postgres_port = env.get("POSTGRES_HOST_PORT", "5432")
ollama_port = env.get("OLLAMA_HOST_PORT", "11434")
backend_port = env.get("BACKEND_HOST_PORT", "8080")
frontend_port = env.get("FRONTEND_HOST_PORT", "4200")
storybook_port = env.get("STORYBOOK_HOST_PORT", "6006")

# ────────────────────────────────────────────────
# Infra — services Docker (PostgreSQL, Ollama)
# ────────────────────────────────────────────────

docker_compose("docker-compose.yml")
dc_resource("postgres", labels = ["infra"])
dc_resource(
    "ollama",
    labels = ["infra"],
    links = [link("http://{}:{}".format(host, ollama_port), "Ollama API")],
)

# Bouton « Purge » attaché au panel `postgres` — drop schéma + redémarrage backend (qui rejoue
# Flyway from scratch sur le schéma vide).
#
# Le restart passe par `tilt trigger backend`, PAS par un `touch application.yml`. Raison : sur WSL2
# le repo est sur un montage `/mnt/c` (9p) où l'inotify ne se propage pas de façon fiable — Tilt ne
# voit donc pas le `touch` et ne relance jamais le `serve_cmd`. Résultat (piège vécu) : schéma droppé
# mais backend toujours up sur ses vieilles connexions → tables manquantes, `/actuator/health` KO.
# `tilt trigger` force l'update du resource indépendamment du file-watch → 100 % fiable.
cmd_button(
    name = "db-purge",
    resource = "postgres",
    text = "Purge — drop schema + restart backend",
    icon_name = "delete_sweep",
    argv = [
        "sh",
        "-c",
        "docker exec portfolioai-postgres psql -U portfolioai -d portfolioai -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO portfolioai; GRANT ALL ON SCHEMA public TO public;' && tilt trigger backend",
    ],
)

# ────────────────────────────────────────────────
# App — Backend Spring Boot & Frontend Angular
# ────────────────────────────────────────────────

# Le `serve_cmd` source `.env` à la racine du repo (`set -a` + `. ../.env`) pour exporter
# **toutes** ses variables au sous-process gradle. Spring Boot les lit ensuite via son
# relaxed binding — `POSTGRES_HOST_PORT` → `${POSTGRES_HOST_PORT}` dans application.yml,
# `ANTHROPIC_API_KEY` → `anthropic.api.key`, `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID`
# → la property correspondante, etc. Plus de var-par-var hardcodée ici : la single source of
# truth est `.env`. Si `.env` n'existe pas (fresh clone), gradle démarre sans aucune var et
# Spring retombe sur les défauts d'application.yml — comportement attendu.
#
# Profils Spring : `BACKEND_AUTH_MODE` (sourcée depuis `.env`) pilote quels profiles le backend
# active. Les boutons Tilt ci-dessous flippent le mode en éditant `.env` puis en touchant
# `application.yml` (qui re-déclenche le `serve_cmd` via les `deps`).
#   - no-auth (défaut) → --spring.profiles.active=local,local-no-auth
#       → `LocalNoAuthSecurityConfig` bypasse Spring Security, user fake ADMIN seedé au boot.
#   - oauth            → --spring.profiles.active=local
#       → `SecurityConfig` kicks in, vrai flow OAuth Google (creds via env vars sourcées
#         depuis `.env` → `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_{CLIENT_ID,CLIENT_SECRET}`).
backend_cmd = """cd backend && \\
  if [ -f ../.env ]; then set -a ; . ../.env ; set +a ; fi ; \\
  AUTH_MODE=${BACKEND_AUTH_MODE:-no-auth} ; \\
  if [ \"$AUTH_MODE\" = \"oauth\" ]; then PROFILES=\"local\"; else PROFILES=\"local,local-no-auth\"; fi ; \\
  echo \"[Tilt] backend launching with --spring.profiles.active=$PROFILES (BACKEND_AUTH_MODE=$AUTH_MODE)\" ; \\
  JAVA_HOME=$(mise where java) \\
    ./gradlew bootRun --args=\"--spring.profiles.active=$PROFILES\""""

local_resource(
    name = "backend",
    serve_cmd = backend_cmd,
    deps = [
        "backend/src",
        "backend/build.gradle.kts",
        "backend/settings.gradle.kts",
    ],
    resource_deps = ["postgres", "ollama"],
    readiness_probe = probe(
        http_get = http_get_action(port = int(backend_port), path = "/actuator/health"),
        period_secs = 3,
        failure_threshold = 20,
    ),
    labels = ["app"],
    links = [
        link("http://{}:{}/actuator/health".format(host, backend_port), "Health"),
        link("http://{}:{}/swagger-ui.html".format(host, backend_port), "Swagger UI"),
    ],
)

# Boutons pour flipper `BACKEND_AUTH_MODE` dans `.env` sans éditer le fichier à la main. Chaque
# bouton réécrit la ligne (ou l'ajoute si absente), puis force le restart du backend via
# `tilt trigger backend` → le shell relance `bootRun`, relit `.env` et démarre Spring avec les
# profiles correspondants. On utilise `tilt trigger` plutôt qu'un `touch application.yml` parce que
# l'inotify de Tilt n'est pas fiable sur le montage `/mnt/c` 9p en WSL2 (cf. bouton db-purge).
cmd_button(
    name = "switch-auth-mode-oauth",
    resource = "backend",
    text = "Mode → OAuth (test login Google)",
    icon_name = "login",
    argv = [
        "sh",
        "-c",
        "set -e; touch .env; grep -v '^BACKEND_AUTH_MODE=' .env > .env.tmp || true; mv .env.tmp .env; echo 'BACKEND_AUTH_MODE=oauth' >> .env; tilt trigger backend; echo 'Switched to OAuth mode — backend restarting. Make sure application-local.yml has real google client-id/secret + app.admin.emails.'",
    ],
)

cmd_button(
    name = "switch-auth-mode-no-auth",
    resource = "backend",
    text = "Mode → no-auth (dev rapide)",
    icon_name = "developer_mode",
    argv = [
        "sh",
        "-c",
        "set -e; touch .env; grep -v '^BACKEND_AUTH_MODE=' .env > .env.tmp || true; mv .env.tmp .env; echo 'BACKEND_AUTH_MODE=no-auth' >> .env; tilt trigger backend; echo 'Switched to no-auth mode — backend restarting with fake ADMIN dev@local.test'",
    ],
)


# `serve_cmd` runs under non-interactive `sh -c`, so we resolve node/npm through `mise exec`
# rather than relying on PATH. mise reads the repo-root `.tool-versions` (`nodejs 24.15.0`) to
# pick the version — bumping node = bumping `.tool-versions`, no Tiltfile edit needed. Same
# resolver as the backend's `mise where java`, so a single tool manages both runtimes on macOS
# and Linux/WSL alike (replaced the previous nvm + `/usr/libexec/java_home` macOS-only combo).
#
# `--poll 2000` forces `ng serve` to stat-poll the source tree every 2 s instead of relying on
# native filesystem events. Required on WSL2 : the repo sits on a `/mnt/c` 9p/drvfs mount where
# inotify does **not** fire for writes made from the Windows side (e.g. an editor or tool running
# on Windows). Without polling those edits never trigger a rebuild and the dev server looks stuck
# even though the code on disk is correct. The 2 s interval is a CPU/latency compromise.
frontend_cmd = """cd frontend && \\
  mise exec -- npm start -- --host 0.0.0.0 --port {} --poll 2000""".format(frontend_port)

local_resource(
    name = "frontend",
    serve_cmd = frontend_cmd,
    deps = [
        "frontend/apps/web/src",
        "frontend/libs/ui/src",
        "frontend/angular.json",
        "frontend/package.json",
        # `proxy.conf.js` n'est lu que par `ng serve` au démarrage — pas de hot-reload natif.
        # Le mettre en deps fait que Tilt relance le `serve_cmd` (= redémarre le dev server) à
        # chaque sauvegarde du fichier, ce qui évite le piège silencieux : on édite le proxy,
        # Tilt indique « no changes », et on reste avec la vieille config (e.g. les routes
        # `/oauth2/**`, `/logout`, `/login/oauth2/**` ou le flag `xfwd: true` ajoutés en Phase 4
        # auraient été ignorés sans ce deps).
        "frontend/apps/web/proxy.conf.js",
    ],
    labels = ["app"],
    links = [link("http://{}:{}".format(host, frontend_port), "App")],
)

# Storybook — sert la lib `@portfolioai/ui` en isolation. Ressource désactivée au boot
# (`auto_init=False`) parce que Storybook met ~10 s à démarrer et qu'on ne s'en sert pas à
# chaque session : déclenche-la manuellement depuis l'UI Tilt quand tu travailles sur la lib
# (bouton « play » sur le panel `storybook`). HMR géré par Storybook directement, donc pas de
# `deps` qui forceraient Tilt à relancer le serveur sur chaque story édit.
storybook_cmd = """cd frontend && \\
  mise exec -- npm run storybook -- --host 0.0.0.0 --port {} --no-open""".format(storybook_port)

local_resource(
    name = "storybook",
    serve_cmd = storybook_cmd,
    auto_init = False,
    trigger_mode = TRIGGER_MODE_MANUAL,
    labels = ["app"],
    links = [link("http://{}:{}".format(host, storybook_port), "Storybook")],
)

# Affichage des liens utiles
print("Frontend  : http://{}:{}".format(host, frontend_port))
print("Storybook : http://{}:{} (manual start)".format(host, storybook_port))
print("Backend   : http://{}:{}".format(host, backend_port))
print("Health    : http://{}:{}/actuator/health".format(host, backend_port))
