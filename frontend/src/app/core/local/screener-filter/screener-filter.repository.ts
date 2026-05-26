import { ScreenerFilter } from '../../api/screener/screener.repository';

/**
 * Port — local persistence of the user's radar filter. Lets the `/radar` page survive a reload
 * with the user's last knobs intact (gap %, volume ratio, optional cap range, exchange, sector)
 * without a backend round-trip. The default localStorage adapter is single-user / single-device ;
 * a future backend adapter (Phase 7 hors-vague #11 « Persister les préférences utilisateur ») can
 * swap in behind this port without a UI rewrite.
 *
 * `load()` returns `null` when nothing is persisted yet — the caller falls back to
 * [DEFAULT_SCREENER_FILTER] so a fresh user starts with the Phase 6 defaults rather than an
 * empty form.
 */
export abstract class ScreenerFilterRepository {
  abstract load(): ScreenerFilter | null;
  abstract save(filter: ScreenerFilter): void;
}
