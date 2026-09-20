# PortfolioAI — local stack: Postgres in Docker, backend and frontend run natively.
# The logic behind every button lives in devops/tools/tilt/ ; this file only declares and wires.

load("ext://uibutton", "cmd_button")

config.define_string("host", args=False, usage="Host used in the UI links (e.g. 192.168.18.13)")
host = config.parse().get("host", "localhost")

# ─────────────────────────────────────────── configuration

def read_pairs(path, sep):
    """Parses a `.env` (sep '=') or `.tool-versions` (sep ' ') file into a dict."""
    if not os.path.exists(path):
        return {}
    out = {}
    for raw in str(read_file(path)).splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if sep == "=":
            if "=" not in line:
                continue
            k, _, v = line.partition("=")
            out[k.strip()] = v.strip().strip('"').strip("'")
        else:
            parts = line.split()
            if len(parts) >= 2:
                out[parts[0]] = parts[1]
    return out

watch_file(".env")
dotenv = read_pairs(".env", "=")
tools = read_pairs(".tool-versions", " ")

postgres_port = dotenv.get("POSTGRES_HOST_PORT", "5432")
backend_port = dotenv.get("BACKEND_HOST_PORT", "8080")
frontend_port = dotenv.get("FRONTEND_HOST_PORT", "4200")
storybook_port = dotenv.get("STORYBOOK_HOST_PORT", "6006")

# `.env` is watched, so flipping the mode reloads this file and restarts the backend by itself.
auth_mode = dotenv.get("BACKEND_AUTH_MODE", "no-auth")
if auth_mode not in ["no-auth", "oauth"]:
    fail("BACKEND_AUTH_MODE must be 'no-auth' or 'oauth', got '" + auth_mode + "'")
spring_profiles = "local" if auth_mode == "oauth" else "local,local-no-auth"

node_version = tools.get("nodejs", "24.15.0")
java_major = tools.get("java", "openjdk-21").replace("openjdk-", "").replace("temurin-", "").split(".")[0]

# ─────────────────────────────────────────── platform & toolchain

uname = str(local("uname -s", quiet=True, echo_off=True)).strip()
is_mac = uname == "Darwin"
is_wsl = not is_mac and "microsoft" in str(local("uname -r", quiet=True, echo_off=True)).lower()

# What breaks is the 9p mount, not WSL itself: a working copy under /mnt/c can't delete a file
# another process holds open, and inotify misses writes made from the Windows side. A copy on the
# WSL filesystem behaves like any native one, so the workarounds below are keyed on the mount.
on_9p = is_wsl and os.getcwd().startswith("/mnt/")

# Polling costs CPU for every file, every two seconds. It only buys something when inotify is deaf.
ng_poll = " --poll 2000" if on_9p else ""

# Gradle's output and Tilt's own project cache stay on ext4 under WSL either way — off 9p it is no
# longer a workaround, but it still keeps build artefacts out of the working copy.
gradle_build_dir = os.getenv("HOME") + "/.cache/portfolioai/backend-build" if is_wsl else "projects/backend/build"
gradle_cache_dir = os.getenv("HOME") + "/.cache/portfolioai/tilt-project-cache" if is_wsl else "projects/backend/.gradle"
gradle_cache_arg = ' --project-cache-dir="' + gradle_cache_dir + '"' if is_wsl else ""

def resolve(what, cmd, fix):
    """Resolves a toolchain path once, at load time, so commands stay plain one-liners."""
    found = str(local(cmd + " 2>/dev/null || true", quiet=True, echo_off=True)).strip()
    if not found:
        fail("no " + what + " found. Fix: " + fix)
    return found

java_home = resolve(
    "JDK " + java_major,
    "/usr/libexec/java_home -v " + java_major if is_mac else "mise where java",
    "install a JDK " + java_major + " (see .tool-versions)",
)
node_bin = resolve(
    "node " + node_version,
    'export NVM_DIR="$HOME/.nvm" ; . "$NVM_DIR/nvm.sh" --no-use ; dirname $(nvm which ' + node_version + ")"
    if is_mac
    else "echo $(mise where node)/bin",
    "nvm install " + node_version if is_mac else "mise install node@" + node_version,
)

def dedupe_path(raw):
    """Keeps the first occurrence of each entry. The PATH Tilt inherits already carries the mise
    bins (the launching shell has mise active) and, under WSL, a doubled Windows interop block —
    prepending to it compounds the duplicates in every command we then run."""
    seen = {}
    entries = []
    for entry in raw.split(":"):
        if entry and entry not in seen:
            seen[entry] = True
            entries.append(entry)
    return ":".join(entries)

tool_env = {"JAVA_HOME": java_home, "PATH": dedupe_path(node_bin + ":" + os.getenv("PATH"))}
if is_wsl:
    tool_env["GRADLE_BUILD_DIR"] = gradle_build_dir

# Exported so the tool scripts resolve the same toolchain and the same relocated dirs as Tilt does.
local(
    'echo "$CONTENTS" > .tilt.env',
    env={
        "CONTENTS": "\n".join(
            [k + "=" + v for k, v in tool_env.items()]
            + [
                "GRADLE_BUILD_DIR=" + gradle_build_dir,
                "GRADLE_PROJECT_CACHE=" + gradle_cache_dir,
                "NODE_BIN=" + node_bin,
                # The scripts branch on it the same way this file does (9p quirks).
                "IS_WSL=" + ("1" if is_wsl else "0"),
            ]
        )
    },
    quiet=True,
    echo_off=True,
)

# ─────────────────────────────────────────── infra

docker_compose("docker-compose.yml")
dc_resource("postgres", labels=["infra"])

local_resource(
    name="frontend-deps",
    cmd="./devops/tools/tilt/frontend-deps.sh",
    env=tool_env,
    deps=["projects/frontend/package-lock.json", "devops/tools/tilt/frontend-deps.sh"],
    labels=["infra"],
)

# Recompiles into the classpath that spring-boot-devtools polls, which restarts the running context
# on its own. Test sources are excluded — they never belong to the running app.
#
# `deps` is empty on WSL2: Tilt's watch is inotify-based and never sees a write made from the
# Windows side, so it would silently stop recompiling exactly when an editor (or an agent) running
# on Windows edits the code. `backend-watch` below polls instead — measured on this machine: a
# Windows-side edit triggers nothing without it.
local_resource(
    name="backend-compile",
    cmd="cd projects/backend && ./gradlew classes" + gradle_cache_arg,
    env=tool_env,
    deps=[] if is_wsl else ["projects/backend/src/main"],
    resource_deps=["backend"],
    labels=["infra"],
)

if is_wsl:
    local_resource(
        name="backend-watch",
        serve_cmd="./devops/tools/tilt/backend-watch.sh",
        serve_env=tool_env,
        resource_deps=["backend-compile"],
        labels=["infra"],
    )

# ─────────────────────────────────────────── app

backend_cmd = """cd projects/backend && \\
  if [ -f ../../.env ]; then set -a ; . ../../.env ; set +a ; fi ; \\
  ./gradlew --no-daemon bootRun --configuration-cache{cache} --args="--spring.profiles.active={profiles}\"""".format(
    cache=gradle_cache_arg, profiles=spring_profiles
)

local_resource(
    name="backend",
    serve_cmd=backend_cmd,
    serve_env=tool_env,
    # Sources are deliberately absent: they are handled by `backend-compile`, which is a ~2 s
    # devtools restart instead of the ~40 s cold `bootRun` a change here costs (resource above).
    deps=["projects/backend/build.gradle.kts", "projects/backend/settings.gradle.kts"],
    resource_deps=["postgres"],
    readiness_probe=probe(
        http_get=http_get_action(port=int(backend_port), path="/actuator/health"),
        period_secs=3,
        failure_threshold=20,
    ),
    labels=["app"],
    links=[
        link("http://{}:{}/actuator/health".format(host, backend_port), "Health"),
        link("http://{}:{}/swagger-ui.html".format(host, backend_port), "Swagger UI"),
    ],
)

local_resource(
    name="frontend",
    serve_cmd="cd projects/frontend && npm start -- --host 0.0.0.0 --port {}{}".format(frontend_port, ng_poll),
    serve_env=tool_env,
    # `proxy.conf.js` is only read at startup, so it has to restart the dev server.
    deps=["projects/frontend/apps/web/proxy.conf.js"],
    resource_deps=["frontend-deps"],
    # Without a probe the resource goes green when the process starts, which is a minute before the
    # dev server binds its port — it only listens once the first build lands. TCP rather than HTTP:
    # a successful http_get probe dumps the whole page into the Tilt logs.
    readiness_probe=probe(
        tcp_socket=tcp_socket_action(port=int(frontend_port)),
        period_secs=3,
        failure_threshold=40,
    ),
    labels=["app"],
    links=[link("http://{}:{}".format(host, frontend_port), "App")],
)

local_resource(
    name="storybook",
    serve_cmd="cd projects/frontend && npm run storybook -- --host 0.0.0.0 --port {} --no-open".format(storybook_port),
    serve_env=tool_env,
    resource_deps=["frontend-deps"],
    auto_init=False,
    trigger_mode=TRIGGER_MODE_MANUAL,
    readiness_probe=probe(
        tcp_socket=tcp_socket_action(port=int(storybook_port)),
        period_secs=3,
        failure_threshold=40,
    ),
    labels=["app"],
    links=[link("http://{}:{}".format(host, storybook_port), "Storybook")],
)

cmd_button(
    name="auth-mode-oauth",
    resource="backend",
    text="Mode → OAuth (real Google login)",
    icon_name="login",
    argv=["./devops/tools/tilt/auth-mode.sh", "oauth"],
)

cmd_button(
    name="auth-mode-no-auth",
    resource="backend",
    text="Mode → no-auth (fast dev)",
    icon_name="developer_mode",
    argv=["./devops/tools/tilt/auth-mode.sh", "no-auth"],
)

# ─────────────────────────────────────────── tools

# Diagnostic, not a startup step: at `tilt up` time half of what it looks at is legitimately not
# there yet. Runs standalone too, which is what to do when Tilt itself refuses to load.
local_resource(
    name="doctor 🩺",
    cmd="./devops/tools/tilt/doctor.sh",
    deps=["devops/tools/tilt/doctor.sh"],
    auto_init=False,
    trigger_mode=TRIGGER_MODE_MANUAL,
    labels=["tools"],
)

# Button holders — the resource itself does nothing, the buttons are the tooling.
local_resource(name="database 🛢", cmd="date", labels=["tools"])

cmd_button(
    name="db-purge",
    resource="database 🛢",
    text="Purge — drop schema + restart backend",
    icon_name="delete_sweep",
    argv=["./devops/tools/tilt/db-purge.sh"],
    requires_confirmation=True,
)

cmd_button(
    name="db-seed",
    resource="database 🛢",
    text="Seed — load the demo data",
    icon_name="dataset",
    argv=["./devops/tools/tilt/db-seed.sh"],
)

local_resource(
    name="housekeeping 🧹",
    cmd="docker system df",
    auto_init=False,
    trigger_mode=TRIGGER_MODE_MANUAL,
    labels=["tools"],
)

cmd_button(
    name="docker-prune",
    resource="housekeeping 🧹",
    text="Docker — remove everything unused",
    icon_name="cleaning_services",
    argv=["./devops/tools/tilt/docker-prune.sh"],
    requires_confirmation=True,
)

cmd_button(
    name="gradle-reset",
    resource="housekeeping 🧹",
    text="Gradle — stop daemons + wipe caches",
    icon_name="restart_alt",
    argv=["./devops/tools/tilt/gradle-reset.sh"],
)

local_resource(name="checks 🧪", cmd="date", labels=["tools"])

for check in ["backend-test", "frontend-test", "lint", "format"]:
    cmd_button(
        name="check-" + check,
        resource="checks 🧪",
        text=check.replace("-", " "),
        icon_name="task_alt",
        argv=["./devops/tools/tilt/run-check.sh", check],
    )

print("Frontend  : http://{}:{}".format(host, frontend_port))
print("Backend   : http://{}:{}  (profiles: {})".format(host, backend_port, spring_profiles))
print("Storybook : http://{}:{}  (manual start)".format(host, storybook_port))
