# Audits

Revues de code globales archivées. Chaque audit est daté et figé — il représente l'état du codebase à un instant donné. Les findings ne sont pas tous tracés ; certains restent ici comme observation, d'autres remontent vers `backlog.md` (dette technique ou phase suivante) si on décide d'en faire des actions.

**Convention** : un fichier par audit, format `YYYY-MM-DD-titre-court.md`. Le frontmatter du document précise scope, méthode et état du commit au moment de la revue.

## Historique

- [2026-05-24 — Revue globale pré-clôture Phase 5 (delta `v0.6.0..HEAD` : 44 commits, 138 fichiers — Phase 5 entière (Cloud Run + Supabase + WIF + Sentry/GlitchTip + custom domain Cloudflare + backup pipeline + `/actuator/info`) + session polish 2026-05-24 (Testcontainers migration, Ollama prod gating, Provider gating closure + fix stale-rendering, renumérotation Phase 6/7 + ajout Phase 8 e2e, bumps CI, 3 polish bundles dette technique, onboarding `testeur.md`, `shared/filter-window/`) — 3 subagents `code-reviewer` en parallèle, 3 Bloquants courts à patcher avant clôture)](./2026-05-24-pre-phase5-close.md)
- [2026-05-17 — Revue globale pré-`v0.6.0` (clôture Phase 4 : delta `v0.5.1..HEAD` — 6 commits, 98 fichiers — OAuth2 Google OIDC + CSRF cookie-based SPA + multi-tenant `user_id` FK + provider gating + Flyway V1→V10 squash + DevX toggle `BACKEND_AUTH_MODE` — 3 subagents `code-reviewer` en parallèle sur 3 lentilles sécurité/backend/frontend, 2 Bloquants à patcher avant tag)](./2026-05-17-pre-v0.6.0-phase4.md)
- [2026-05-16 — Revue globale pré-`v0.5.1` (delta `v0.5.0..HEAD` : 19 commits, 213 fichiers — 7 refactors backend B1-B7, pilote rxResource frontend + split `core/` 3 axes, 4 nouveaux skills backend + agent `code-reviewer`, renumérotage phases 4=Auth/5=Deploy/6=Vision, dette tech cleanup — 3 subagents en parallèle, 2 Critiques 1-liner)](./2026-05-16-pre-v0.5.1.md)
- [2026-05-14 — Revue globale fin Phase 3 avant tag `v0.5.0` (foundation prompt management, page observabilité narrative, score de cohérence, détection de biais — 3 subagents en parallèle, 1 bloquant patché en session)](./2026-05-14-fin-phase-3.md)
- [2026-05-10 — Revue globale fin Phase 2.5 avant tag `v0.4.0` (config runtime, SSE narratif, Phase 0 décommission, Ollama panel, Anthropic SECRET)](./2026-05-10-fin-phase-2.5.md)
- [2026-05-06 — Revue globale fin Phase 2 (post analyst / earnings / sidenav outils chart / sector swap Finnhub)](./2026-05-06-fin-phase-2.md)
- [2026-05-02 — Revue globale post-i18n / zoneless / bumps deps](./2026-05-02-revue-globale.md)
