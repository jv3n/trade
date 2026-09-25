# PortfolioAI production Dockerfile — multi-stage build for Cloud Run linux/amd64
#
# Targets:
#   - Stage 1 (frontend-builder): builds Angular static assets via `npm run build`
#   - Stage 2 (backend-builder):  builds the Spring Boot fat jar, embedding the
#                                  frontend's compiled output in `src/main/resources/static/`
#   - Stage 3 (runtime):           minimal JRE-only image, ~200 MB
#
# Built from the repo root:
#   docker build -f devops/prod/Dockerfile -t portfolioai-backend:dev .
#
# Pushed to Artifact Registry (cf. devops/prod/README.md for the full command):
#   docker tag portfolioai-backend:dev \
#     northamerica-northeast1-docker.pkg.dev/trade-496613/backend/portfolioai:<tag>
#   docker push northamerica-northeast1-docker.pkg.dev/trade-496613/backend/portfolioai:<tag>

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
RUN npm run build

# Angular 17+ output layout: dist/<app-name>/browser/
# Adjust the path below if angular.json's outputPath is customized.

# ---------------------------------------------------------------------------
# Stage 2 — Spring Boot backend (with frontend embedded)
# ---------------------------------------------------------------------------
FROM eclipse-temurin:21-jdk-jammy AS backend-builder

# Passed by `deploy.yml` (= the GitHub Release tag) and surfaced on `/actuator/info > build.version`.
ARG APP_VERSION=0.0.0-SNAPSHOT

WORKDIR /app

# Cache the gradle wrapper + dependency resolution before copying source
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
FROM eclipse-temurin:21-jre-jammy AS runtime

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
