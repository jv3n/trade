# PortfolioAI — Tiltfile

# Hôte réseau (override avec: tilt up -- --host=192.168.18.13)
config.define_string("host", args=False, usage="Network host (e.g. 192.168.18.13)")
cfg = config.parse()
host = cfg.get("host", "localhost")

# PostgreSQL via docker-compose
docker_compose("docker-compose.yml")

# Ollama — pull du modèle qwen2:1.5b au démarrage
local_resource(
    name = "llm:pull-qwen2",
    cmd = "docker exec portfolioai-ollama ollama pull qwen2:1.5b",
    resource_deps = ["ollama"],
    labels = ["llm"],
    links = [link("http://{}:11434".format(host), "Ollama API")],
)

# Backend Spring Boot — build continu avec Gradle
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
    labels = ["backend"],
    links = [link("http://{}:8080/actuator/health".format(host), "Health")],
)

# Frontend Angular — dev server continu
local_resource(
    name = "frontend",
    serve_cmd = "cd frontend && npm start -- --host 0.0.0.0",
    deps = [
        "frontend/src",
        "frontend/angular.json",
        "frontend/package.json",
    ],
    labels = ["frontend"],
    links = [link("http://{}:4200".format(host), "App")],
)

# ────────────────────────────────────────────────
# Reset BDD — drop schéma + redémarrage backend automatique
# ────────────────────────────────────────────────

local_resource(
    name = "db:reset",
    cmd = "docker exec portfolioai-postgres psql -U portfolioai -d portfolioai -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO portfolioai; GRANT ALL ON SCHEMA public TO public;' && touch backend/src/main/resources/application.yml",
    trigger_mode = TRIGGER_MODE_MANUAL,
    auto_init = False,
    resource_deps = ["postgres"],
    labels = ["db-tools"],
)

local_resource(
    name = "db:seed",
    cmd = "docker exec -i portfolioai-postgres psql -U portfolioai -d portfolioai < scripts/seed.sql",
    trigger_mode = TRIGGER_MODE_MANUAL,
    auto_init = False,
    resource_deps = ["postgres"],
    labels = ["db-tools"],
)

# Affichage des liens utiles
print("Frontend : http://{}:4200".format(host))
print("Backend  : http://{}:8080".format(host))
print("Health   : http://{}:8080/actuator/health".format(host))
