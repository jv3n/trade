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

# Cache layer for npm install — only invalidated when package.json/lock changes
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund --prefer-offline

# Source + build
COPY frontend/ ./
RUN npm run build

# Angular 17+ output layout: dist/<app-name>/browser/
# Adjust the path below if angular.json's outputPath is customized.

# ---------------------------------------------------------------------------
# Stage 2 — Spring Boot backend (with frontend embedded)
# ---------------------------------------------------------------------------
FROM eclipse-temurin:21-jdk-jammy AS backend-builder

# Version passée par le workflow `deploy.yml` (= tag de la GitHub Release, ex: `v0.7.0`). Le
# build gradle pickup la valeur via `-Pversion=$APP_VERSION` plus bas → finit dans
# `META-INF/build-info.properties` → exposé sur `/actuator/info > build.version`. Default
# `0.0.0-SNAPSHOT` pour un `docker build` local sans `--build-arg`.
ARG APP_VERSION=0.0.0-SNAPSHOT

WORKDIR /app

# Cache the gradle wrapper + dependency resolution before copying source
COPY backend/gradle/ ./backend/gradle/
COPY backend/gradlew backend/build.gradle.kts backend/settings.gradle.kts backend/gradle.properties ./backend/
RUN cd backend && ./gradlew --no-daemon dependencies > /dev/null 2>&1 || true

# Copy backend source
COPY backend/ ./backend/

# Copy `.git/` so `gradle-git-properties` peut générer `META-INF/git.properties` (commit SHA,
# branche, tag) → exposé sur `/actuator/info > git`. Le workflow CI doit faire un `fetch-depth: 0`
# côté `actions/checkout` pour que les tags soient présents (sinon la section `git.tags` du payload
# sera vide). Le plugin a `failOnNoGitDirectory = false` donc un build hors-git ne casse pas.
COPY .git/ ./.git/

# Embed the Angular build into Spring Boot's static resources directory
# (Spring Boot serves files under `static/` automatically at the application root)
COPY --from=frontend-builder /app/frontend/dist/ ./backend/src/main/resources/static-frontend/
RUN mkdir -p ./backend/src/main/resources/static/ \
 && cp -r ./backend/src/main/resources/static-frontend/*/browser/* ./backend/src/main/resources/static/ \
 && rm -rf ./backend/src/main/resources/static-frontend/

# Build the fat jar — `-Pversion=$APP_VERSION` propage le tag de release au gradle `version`
# property (cf. `build.gradle.kts` ligne `version = …`). Le `v` initial du tag GitHub
# (`v0.7.0`) est conservé tel quel dans `build.version` — cohérent avec le tag Cloud Run /
# Docker image / SENTRY_RELEASE.
RUN cd backend && ./gradlew --no-daemon bootJar -x test -Pversion=$APP_VERSION

# ---------------------------------------------------------------------------
# Stage 3 — Minimal runtime image
# ---------------------------------------------------------------------------
FROM eclipse-temurin:21-jre-jammy AS runtime

# Run as non-root for defense in depth
RUN groupadd --system spring && useradd --system --gid spring --no-create-home spring
USER spring

WORKDIR /app
COPY --from=backend-builder --chown=spring:spring /app/backend/build/libs/*.jar /app/app.jar

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
