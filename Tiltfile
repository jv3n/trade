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

# Bouton « Purge » attaché au panel `postgres` — drop schéma + redémarrage backend
# automatique (via touch d'application.yml).
cmd_button(
    name = "db-purge",
    resource = "postgres",
    text = "Purge — drop schema + restart backend",
    icon_name = "delete_sweep",
    argv = [
        "sh",
        "-c",
        "docker exec portfolioai-postgres psql -U portfolioai -d portfolioai -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO portfolioai; GRANT ALL ON SCHEMA public TO public;' && touch backend/src/main/resources/application.yml",
    ],
)

# ────────────────────────────────────────────────
# LLM — modèle local Ollama
# ────────────────────────────────────────────────

# Garantit que l'instance Ollama locale a le modèle attendu par le backend.
# Idempotent : si déjà pull, c'est un no-op rapide. Sinon, télécharge ~2 GB la première fois.
#
# `qwen2.5:3b` est le bon compromis sur M1 : ~2 GB, 5-10 s par narratif, JSON structuré
# fiable. Mistral 7B (~4 GB) était l'ancien défaut mais sa latence 30-60 s sur M1 saturait
# le read timeout côté Spring — switch fait après une session de tests qui a coupé sur
# timeout.
#
# Si tu veux pousser la qualité en sacrifiant de la vitesse : pull `qwen2.5:7b`,
# `phi4-mini` (3.8B) ou `llama3.2:3b` puis bouge `ollama.model` dans
# `application-local.yml`.
local_resource(
    name = "llm:ensure-model",
    cmd = "docker exec portfolioai-ollama ollama pull qwen2.5:3b",
    resource_deps = ["ollama"],
    labels = ["llm"],
)

# ────────────────────────────────────────────────
# App — Backend Spring Boot & Frontend Angular
# ────────────────────────────────────────────────

# Les ports custom (.env) sont injectés via les env vars que le `application.yml` lit
# avec leurs défauts (`${POSTGRES_HOST_PORT:5432}`, `${OLLAMA_HOST_PORT:11434}`,
# `${BACKEND_HOST_PORT:8080}`). Important : les env vars doivent être placées en
# **prefix de la commande `./gradlew`** elle-même (pas en prefix du `cd`), sinon le
# shell les exporte uniquement pour `cd` et `gradlew` redémarre sans elles —
# Spring retombe alors sur ses défauts et la connexion à Postgres échoue si l'utilisateur
# a remappé le port hôte.
backend_cmd = "cd backend && POSTGRES_HOST_PORT={pg} OLLAMA_HOST_PORT={ol} BACKEND_HOST_PORT={be} JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew bootRun --args='--spring.profiles.active=local'".format(
    pg = postgres_port, ol = ollama_port, be = backend_port,
)

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
    links = [link("http://{}:{}/actuator/health".format(host, backend_port), "Health")],
)

local_resource(
    name = "frontend",
    serve_cmd = "cd frontend && npm start -- --host 0.0.0.0 --port {}".format(frontend_port),
    deps = [
        "frontend/src",
        "frontend/angular.json",
        "frontend/package.json",
    ],
    labels = ["app"],
    links = [link("http://{}:{}".format(host, frontend_port), "App")],
)

# Affichage des liens utiles
print("Frontend : http://{}:{}".format(host, frontend_port))
print("Backend  : http://{}:{}".format(host, backend_port))
print("Health   : http://{}:{}/actuator/health".format(host, backend_port))
