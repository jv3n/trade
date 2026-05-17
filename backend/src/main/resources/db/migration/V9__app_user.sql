-- =============================================================================
-- Phase 4 — Authentication foundation
--
-- Crée la table `app_user` (et seulement elle) — Phase 4 v1 ajoute l'authentification
-- OAuth2 Google + rôles ADMIN/USER, sans toucher au modèle multi-tenant des autres
-- tables. Le backfill `user_id` FK sur portfolio / watchlist_entry / app_config /
-- ticker_narrative_snapshot est reporté à un ticket dédié (cf. backlog Phase 4
-- « décider plus tard ») — les narratives restent partagées globalement pour ne pas
-- multiplier les coûts LLM.
--
-- Décisions :
--   - Table nommée `app_user` (pas `user`) parce que `user` est un mot réservé
--     PostgreSQL ; quoter `"user"` partout est friction inutile.
--   - `email` est la clé naturelle (UNIQUE), pas `provider_id` : si on câble un 2e
--     provider plus tard (GitHub OAuth), on évite de forker un user par provider
--     pour le même humain. `provider` + `provider_id` restent persistés pour la
--     traçabilité mais ne servent pas de clé d'unicité.
--   - `role` est calculé une fois à la création (`CustomOAuth2UserService` lit la
--     whitelist `app.admin.emails`), pas ré-évalué à chaque login. Modifications
--     ultérieures via SQL ou endpoint dédié futur — re-appliquer la whitelist à
--     chaque login écraserait une rétrogradation manuelle d'ADMIN à USER.
--   - Pas d'index secondaire sur `email` : la contrainte UNIQUE en pose un
--     implicitement, suffisant pour le seul lookup utilisé (`findByEmail`).
-- =============================================================================

CREATE TABLE app_user (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    display_name  VARCHAR(255),
    -- 'google' pour les logins OAuth Google, 'local-dev' pour le user seedé sous
    -- profile `local-no-auth`. Pas d'enum SQL : la valeur reste interne au code
    -- Kotlin, ajouter un provider futur ne demande pas une migration.
    provider      VARCHAR(50)  NOT NULL,
    -- Google `sub` claim pour les users OAuth ; NULL pour `local-dev` (pas d'OAuth).
    provider_id   VARCHAR(255),
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('ADMIN', 'USER')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);
