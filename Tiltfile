# PortfolioAI — Tiltfile

load("ext://uibutton", "cmd_button")

# Hôte réseau (override avec: tilt up -- --host=192.168.18.13)
config.define_string("host", args=False, usage="Network host (e.g. 192.168.18.13)")
cfg = config.parse()
host = cfg.get("host", "localhost")

# ────────────────────────────────────────────────
# Infra — services Docker (PostgreSQL, Ollama)
# ────────────────────────────────────────────────

docker_compose("docker-compose.yml")
dc_resource("postgres", labels = ["infra"])
dc_resource(
    "ollama",
    labels = ["infra"],
    links = [link("http://{}:11434".format(host), "Ollama API")],
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

local_resource(
    name = "backend",
    serve_cmd = "cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew bootRun --args='--spring.profiles.active=local'",
    deps = [
        "backend/src",
        "backend/build.gradle.kts",
        "backend/settings.gradle.kts",
    ],
    resource_deps = ["postgres", "ollama"],
    readiness_probe = probe(
        http_get = http_get_action(port = 8080, path = "/actuator/health"),
        period_secs = 3,
        failure_threshold = 20,
    ),
    labels = ["app"],
    links = [link("http://{}:8080/actuator/health".format(host), "Health")],
)

local_resource(
    name = "frontend",
    serve_cmd = "cd frontend && npm start -- --host 0.0.0.0",
    deps = [
        "frontend/src",
        "frontend/angular.json",
        "frontend/package.json",
    ],
    labels = ["app"],
    links = [link("http://{}:4200".format(host), "App")],
)

# Affichage des liens utiles
print("Frontend : http://{}:4200".format(host))
print("Backend  : http://{}:8080".format(host))
print("Health   : http://{}:8080/actuator/health".format(host))
