-- User preferences : « system » theme and the balance display currency (issue #201).
--
-- The theme was a two-way switch (dark / light). The settings page now offers a third choice —
-- « system » — which follows the OS light / dark setting live, and is the sensible default : the
-- app shouldn't decide that for the user before they have said anything.
--
-- The balance currency was a toggle living in the account page's memory, reset on every visit. It
-- is a preference, so it belongs on the user like the other two. The account stays USD-denominated
-- either way : CAD is a display conversion at the day's ECB rate.

ALTER TABLE app_user
  DROP CONSTRAINT IF EXISTS app_user_theme_check;

ALTER TABLE app_user
  ADD CONSTRAINT app_user_theme_check CHECK (theme IN ('system', 'dark', 'light'));

-- Existing users keep the theme they chose ; only the column default moves.
ALTER TABLE app_user
  ALTER COLUMN theme SET DEFAULT 'system';

ALTER TABLE app_user
  ADD COLUMN balance_currency VARCHAR(3) NOT NULL DEFAULT 'USD'
    CHECK (balance_currency IN ('USD', 'CAD'));
