# PortfolioAI — Tiltfile

load("ext://uibutton", "cmd_button")

# Network host (override with: tilt up -- --host=192.168.18.13)
config.define_string("host", args=False, usage="Network host (e.g. 192.168.18.13)")
cfg = config.parse()
host = cfg.get("host", "localhost")

# ────────────────────────────────────────────────
# Ports — loaded from .env (gitignored) with fallback to defaults
# ────────────────────────────────────────────────
#
# If a `.env` file exists at the repo root, we read it to pick up port overrides
# (POSTGRES_HOST_PORT / OLLAMA_HOST_PORT / BACKEND_HOST_PORT / FRONTEND_HOST_PORT).
# Otherwise we fall back to the defaults. See `.env.example` for the template.
#
# Docker Compose reads `.env` automatically for its own `${VAR:-default}` substitutions ;
# we duplicate the read here because Tilt does NOT auto-load `.env` into its Starlark env
# and we need the values for (a) the Tilt UI links and (b) injecting into the serve_cmds
# that run the backend (Spring) and frontend (Angular).

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
# Toolchain resolver — mise (Linux/WSL) vs nvm + java_home (macOS)
# ────────────────────────────────────────────────
#
# Tilt's `os.name` is Python-style (`posix`/`nt`), not GOOS — useless to tell macOS from Linux.
# We shell out to `uname -s` instead ("Darwin" on macOS, "Linux" on Linux/WSL2). WSL2 reports
# as Linux, which is the branch we want there. On macOS we don't assume `mise` is installed
# and fall back to the historical combo: nvm for node, `/usr/libexec/java_home` for Java.
# Versions are read from the repo-root `.tool-versions` in either case, so bumping a version
# is a single file edit regardless of platform.

def load_tool_versions(path):
    """Reads asdf/mise `.tool-versions`, returns {tool: version}."""
    if not os.path.exists(path):
        return {}
    out = {}
    for raw_line in str(read_file(path)).splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 2:
            out[parts[0]] = parts[1]
    return out

tools = load_tool_versions(".tool-versions")
node_version = tools.get("nodejs", "24.15.0")
# `.tool-versions` java spec looks like `openjdk-21.0.11` or `temurin-21.0.4` — strip the
# distribution prefix and keep only the major for `/usr/libexec/java_home -v <major>`.
java_spec = tools.get("java", "openjdk-21.0.11")
java_major = java_spec.replace("openjdk-", "").replace("temurin-", "").split(".")[0]

uname = str(local("uname -s", quiet = True, echo_off = True)).strip()

if uname == "Darwin":
    java_resolver = "JAVA_HOME=$(/usr/libexec/java_home -v " + java_major + ")"
    # `sh -c` doesn't source ~/.zshrc, so nvm is off PATH — source nvm.sh and pin the version
    # declared in `.tool-versions`.
    node_init = (
        'export NVM_DIR="$HOME/.nvm" ; ' +
        'if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh" --no-use ; ' +
        'nvm use ' + node_version + ' >/dev/null ; fi'
    )
    npm_run = "npm"
else:
    java_resolver = "JAVA_HOME=$(mise where java)"
    node_init = ":"  # noop — mise resolves node per-call via `mise exec`
    npm_run = "mise exec -- npm"

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

# "Purge" button attached to the `postgres` panel — drop the schema + restart the backend
# (which replays Flyway from scratch against the empty schema).
#
# The restart goes through `tilt trigger backend`, NOT a `touch application.yml`. Reason: on
# WSL2 the repo sits on a `/mnt/c` (9p) mount where inotify does not propagate reliably — Tilt
# never sees the `touch` and never re-runs the `serve_cmd`. Outcome (already lived): schema
# dropped but backend still up on its old connections → missing tables, `/actuator/health` KO.
# `tilt trigger` forces the resource update independently of file-watch → 100% reliable.
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

# The `serve_cmd` sources `.env` at the repo root (`set -a` + `. ../.env`) to export **all**
# its variables to the gradle sub-process. Spring Boot then reads them via its relaxed
# binding — `POSTGRES_HOST_PORT` → `${POSTGRES_HOST_PORT}` in application.yml,
# `ANTHROPIC_API_KEY` → `anthropic.api.key`, `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID`
# → the matching property, etc. No more per-var hardcoding here: the single source of truth
# is `.env`. If `.env` does not exist (fresh clone), gradle starts without any var and Spring
# falls back to the application.yml defaults — expected behaviour.
#
# Spring profiles: `BACKEND_AUTH_MODE` (sourced from `.env`) drives which profiles the backend
# activates. The Tilt buttons below flip the mode by editing `.env` then forcing a backend
# restart via `tilt trigger backend`.
#   - no-auth (default) → --spring.profiles.active=local,local-no-auth
#       → `LocalNoAuthSecurityConfig` bypasses Spring Security, fake ADMIN user seeded at boot.
#   - oauth             → --spring.profiles.active=local
#       → `SecurityConfig` kicks in, real Google OAuth flow (creds via env vars sourced from
#         `.env` → `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_{CLIENT_ID,CLIENT_SECRET}`).
backend_cmd = """cd backend && \\
  if [ -f ../.env ]; then set -a ; . ../.env ; set +a ; fi ; \\
  AUTH_MODE=${BACKEND_AUTH_MODE:-no-auth} ; \\
  if [ \"$AUTH_MODE\" = \"oauth\" ]; then PROFILES=\"local\"; else PROFILES=\"local,local-no-auth\"; fi ; \\
  echo \"[Tilt] backend launching with --spring.profiles.active=$PROFILES (BACKEND_AUTH_MODE=$AUTH_MODE)\" ; \\
  """ + java_resolver + """ \\
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

# Buttons to flip `BACKEND_AUTH_MODE` in `.env` without editing the file by hand. Each button
# rewrites the line (or appends it if absent), then forces a backend restart via
# `tilt trigger backend` → the shell re-runs `bootRun`, re-reads `.env`, and starts Spring with
# the matching profiles. We use `tilt trigger` rather than a `touch application.yml` because
# Tilt's inotify is not reliable on the `/mnt/c` 9p mount under WSL2 (see db-purge button).
cmd_button(
    name = "switch-auth-mode-oauth",
    resource = "backend",
    text = "Mode → OAuth (test Google login)",
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
    text = "Mode → no-auth (fast dev)",
    icon_name = "developer_mode",
    argv = [
        "sh",
        "-c",
        "set -e; touch .env; grep -v '^BACKEND_AUTH_MODE=' .env > .env.tmp || true; mv .env.tmp .env; echo 'BACKEND_AUTH_MODE=no-auth' >> .env; tilt trigger backend; echo 'Switched to no-auth mode — backend restarting with fake ADMIN dev@local.test'",
    ],
)


# `serve_cmd` runs under non-interactive `sh -c`, so we resolve node/npm via the toolchain
# resolver picked above (mise on Linux/WSL, nvm on macOS). Either way the node version comes
# from the repo-root `.tool-versions` — bumping node = bumping `.tool-versions`, no Tiltfile
# edit needed.
#
# `--poll 2000` forces `ng serve` to stat-poll the source tree every 2 s instead of relying on
# native filesystem events. Required on WSL2: the repo sits on a `/mnt/c` 9p/drvfs mount where
# inotify does **not** fire for writes made from the Windows side (e.g. an editor or tool running
# on Windows). Without polling those edits never trigger a rebuild and the dev server looks stuck
# even though the code on disk is correct. The 2 s interval is a CPU/latency compromise. On macOS
# it costs ~nothing — native fsevents would work but the option is harmless to leave on.
frontend_cmd = """cd frontend && \\
  """ + node_init + """ ; \\
  """ + npm_run + """ start -- --host 0.0.0.0 --port {} --poll 2000""".format(frontend_port)

local_resource(
    name = "frontend",
    serve_cmd = frontend_cmd,
    deps = [
        "frontend/apps/web/src",
        "frontend/libs/ui/src",
        "frontend/angular.json",
        "frontend/package.json",
        # `proxy.conf.js` is only read by `ng serve` at startup — no native hot-reload.
        # Listing it in `deps` makes Tilt re-run the `serve_cmd` (= restart the dev server) on
        # every save of that file, which avoids the silent trap: you edit the proxy, Tilt says
        # "no changes", and you stay on the old config (e.g. the `/oauth2/**`, `/logout`,
        # `/login/oauth2/**` routes or the `xfwd: true` flag added in Phase 4 would have been
        # ignored without this deps entry).
        "frontend/apps/web/proxy.conf.js",
    ],
    labels = ["app"],
    links = [link("http://{}:{}".format(host, frontend_port), "App")],
)

# Storybook — serves the `@portfolioai/ui` lib in isolation. Resource disabled at boot
# (`auto_init=False`) because Storybook takes ~10 s to start and we don't need it every
# session: trigger it manually from the Tilt UI when working on the lib ("play" button on
# the `storybook` panel). HMR is handled by Storybook itself, so no `deps` that would force
# Tilt to restart the server on every story edit.
storybook_cmd = """cd frontend && \\
  """ + node_init + """ ; \\
  """ + npm_run + """ run storybook -- --host 0.0.0.0 --port {} --no-open""".format(storybook_port)

local_resource(
    name = "storybook",
    serve_cmd = storybook_cmd,
    auto_init = False,
    trigger_mode = TRIGGER_MODE_MANUAL,
    labels = ["app"],
    links = [link("http://{}:{}".format(host, storybook_port), "Storybook")],
)

# Print useful links
print("Frontend  : http://{}:{}".format(host, frontend_port))
print("Storybook : http://{}:{} (manual start)".format(host, storybook_port))
print("Backend   : http://{}:{}".format(host, backend_port))
print("Health    : http://{}:{}/actuator/health".format(host, backend_port))
