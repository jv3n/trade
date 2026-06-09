 -- V7__user_preferences.sql — Persist UI preferences (theme + language) on the user.
--
-- These two knobs used to live only in the browser's localStorage (per-device). Moving them onto
-- `app_user` makes them follow the account across devices. The SPA reads them from `GET /api/me`
-- and writes them through `PUT /api/me/preferences`.
--
-- Defaults match the SPA's prior localStorage defaults (theme = dark, language = fr) so existing
-- rows keep rendering identically. Allowed values are pinned by CHECK constraints — the app-layer
-- validation in AuthService.updatePreferences gives a clean 400 before we ever hit these.

ALTER TABLE app_user
    ADD COLUMN theme    VARCHAR(20) NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    ADD COLUMN language VARCHAR(5)  NOT NULL DEFAULT 'fr'   CHECK (language IN ('fr', 'en'));
