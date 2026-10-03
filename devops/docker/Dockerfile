# check=skip=InvalidDefaultArgInFrom
# PortfolioAI production Dockerfile — multi-stage build for Cloud Run linux/amd64
#
# Targets:
#   - Stage 1 (frontend-builder): builds Angular static assets via `npm run build`
#   - Stage 2 (backend-builder):  builds the Spring Boot fat jar, embedding the
#                                  frontend's compiled output in `src/main/resources/static/`
#   - Stage 3 (runtime):           minimal JRE-only image, ~200 MB
#
# Built from the repo root, with the JDK `.tool-versions` pins (`25.0.4+7` → tag `25.0.4_7`) :
#   docker build -f devops/docker/Dockerfile -t portfolioai-backend:dev \
#     --build-arg JAVA_VERSION=$(sed -nE 's/^java temurin-(.+)\.0\.LTS$/\1/p' .tool-versions | tr + _) .
#
# Pushed to Artifact Registry (cf. devops/env/production/README.md for the full command):
#   docker tag portfolioai-backend:dev \
#     northamerica-northeast1-docker.pkg.dev/trade-496613/backend/portfolioai:<tag>
#   docker push northamerica-northeast1-docker.pkg.dev/trade-496613/backend/portfolioai:<tag>

# No default on purpose : `.tool-versions` is the one place the JDK is pinned, `deploy.yml` reads it.
ARG JAVA_VERSION

# ---------------------------------------------------------------------------
# Stage 1 — Angular frontend
# ---------------------------------------------------------------------------
FROM node:24-alpine AS frontend-builder

WORKDIR /app/frontend

# Cache layer for npm install — only invalidated when package.json/lock/.npmrc changes.
# `.npmrc` carries `legacy-peer-deps=true` (Storybook 10.x vs Angular 22 peer-dep shim) and MUST
# be present before `npm ci`, otherwise the install fails with ERESOLVE inside the Docker build
# (the later `COPY projects/frontend/ ./` brings it in too late). Drop the `.npmrc` from this COPY the day
# Storybook ships native Angular 22 support and the shim is removed.
COPY projects/frontend/package.json projects/frontend/package-lock.json projects/frontend/.npmrc ./
RUN npm ci --no-audit --no-fund --prefer-offline

# Source + build. The prebuild copies the sheets from the repo's `docs/pattern` and `docs/notes`
# (#419, `apps/web/tools/copy-docs.mjs`) — `/docs/…` seen from this workspace.
COPY projects/frontend/ ./
COPY docs/pattern/ /docs/pattern/
COPY docs/notes/ /docs/notes/

# The release tag goes into the bundle (`Sentry.init > release`) and files the source maps in
# GlitchTip (#463). The maps are built hidden (no `sourceMappingURL`), uploaded, then deleted : they
# never reach the served bundle. Without the token (a local `docker build`) the upload is skipped —
# `deploy.yml` checks the secret is set before it builds. A failed upload only warns : GlitchTip
# being down must not block a release, it costs that one release its readable traces.
# Release files matched by name, not `sourcemaps upload` : GlitchTip registers its artifact bundle
# but stores nothing (#568). No `releases finalize` either — GlitchTip answers it with a 405.
ARG APP_VERSION=0.0.0-SNAPSHOT
ARG SENTRY_URL=https://app.glitchtip.com/
ARG SENTRY_ORG
ARG SENTRY_PROJECT=portfolioai-frontend
RUN --mount=type=secret,id=sentry_auth_token \
    npm run build -- --define "APP_RELEASE='${APP_VERSION}'" \
 && BROWSER_DIR=$(echo dist/*/browser) \
 && if [ -s /run/secrets/sentry_auth_token ]; then \
      export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)" SENTRY_URL SENTRY_ORG SENTRY_PROJECT \
      && { npx sentry-cli releases new "$APP_VERSION" \
           && npx sentry-cli releases files "$APP_VERSION" upload-sourcemaps "$BROWSER_DIR" \
                --url-prefix '~/' --rewrite --validate \
           || echo "WARNING : source maps not uploaded, $APP_VERSION reports minified traces."; }; \
    else echo "No sentry_auth_token secret : source maps not uploaded."; fi \
 && find "$BROWSER_DIR" -name '*.map' -delete

# Angular 17+ output layout: dist/<app-name>/browser/
# Adjust the path below if angular.json's outputPath is customized.

# ---------------------------------------------------------------------------
# Stage 2 — Spring Boot backend (with frontend embedded)
# ---------------------------------------------------------------------------
FROM eclipse-temurin:${JAVA_VERSION}-jdk-jammy AS backend-builder

# Passed by `deploy.yml` (= the GitHub Release tag) and surfaced on `/actuator/info > build.version`.
ARG APP_VERSION=0.0.0-SNAPSHOT

WORKDIR /app

# Cache the gradle wrapper + dependency resolution before copying source. `.tool-versions` first :
# the Gradle toolchain reads the JDK major there.
COPY .tool-versions ./
COPY projects/backend/gradle/ ./projects/backend/gradle/
COPY projects/backend/gradlew projects/backend/build.gradle.kts projects/backend/settings.gradle.kts projects/backend/gradle.properties ./projects/backend/
RUN cd projects/backend && ./gradlew --no-daemon dependencies > /dev/null 2>&1 || true

# Copy backend source
COPY projects/backend/ ./projects/backend/

# `gradle-git-properties` reads it to fill `/actuator/info > git`. The CI checkout needs
# `fetch-depth: 0` or the tags are missing from the payload.
COPY .git/ ./.git/

# Embed the Angular build into Spring Boot's static resources directory
# (Spring Boot serves files under `static/` automatically at the application root)
COPY --from=frontend-builder /app/frontend/dist/ ./projects/backend/src/main/resources/static-frontend/
RUN mkdir -p ./projects/backend/src/main/resources/static/ \
 && cp -r ./projects/backend/src/main/resources/static-frontend/*/browser/* ./projects/backend/src/main/resources/static/ \
 && rm -rf ./projects/backend/src/main/resources/static-frontend/

# The release tag keeps its leading `v`, matching the Cloud Run revision, the image tag and
# SENTRY_RELEASE.
RUN cd projects/backend && ./gradlew --no-daemon bootJar -x test -Pversion=$APP_VERSION

# ---------------------------------------------------------------------------
# Stage 3 — Minimal runtime image
# ---------------------------------------------------------------------------
FROM eclipse-temurin:${JAVA_VERSION}-jre-jammy AS runtime

# Run as non-root for defense in depth
RUN groupadd --system spring && useradd --system --gid spring --no-create-home spring
USER spring

WORKDIR /app
COPY --from=backend-builder --chown=spring:spring /app/projects/backend/build/libs/*.jar /app/app.jar

# Cloud Run injects PORT (defaults to 8080). Spring Boot honors it via server.port=${PORT:8080}
# defined in application-prod.yml.
ENV PORT=8080
EXPOSE 8080

# JVM tuning for a containerized environment:
#   -XX:MaxRAMPercentage=75 leaves headroom for off-heap + stack
#   -XX:+UseG1GC keeps GC latency predictable
#   -Djava.security.egd=file:/dev/./urandom avoids blocking on entropy at startup
ENTRYPOINT ["java", \
            "-XX:MaxRAMPercentage=75", \
            "-XX:+UseG1GC", \
            "-Djava.security.egd=file:/dev/./urandom", \
            "-jar", "/app/app.jar"]
