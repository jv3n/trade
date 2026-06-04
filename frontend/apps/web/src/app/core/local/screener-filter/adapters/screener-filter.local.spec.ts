/**
 * Round-trip + defensive-decoding tests on [LocalStorageScreenerFilterRepository]. The contract
 * is "either we hand back a well-formed [ScreenerFilter] or `null` so the caller falls back to
 * defaults" — never a partially-hydrated object with `NaN` fields, never a thrown exception
 * (a corrupt blob shouldn't break the page).
 *
 * Phase 6 ticket (8) v0.5 slimmed the filter shape to `{ gapPctMin, volumeRatioMin }` and bumped
 * the storage key from `:v1` to `:v2`. Any blob left at the old key is ignored on load — assertion
 * pinned below.
 */
import { ScreenerFilter } from '../../../api/screener/screener.repository';
import { LocalStorageScreenerFilterRepository } from './screener-filter.local';

describe('LocalStorageScreenerFilterRepository', () => {
  let repo: LocalStorageScreenerFilterRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageScreenerFilterRepository();
  });

  afterEach(() => localStorage.clear());

  it('returns null when nothing is persisted', () => {
    expect(repo.load()).toBeNull();
  });

  it('round-trips the slim filter unchanged', () => {
    const filter: ScreenerFilter = { gapPctMin: 12, volumeRatioMin: 4 };
    repo.save(filter);

    expect(repo.load()).toEqual(filter);
  });

  it('ignores a legacy v1 blob and returns null so defaults kick in', () => {
    // Old shape from before Phase 6 ticket (8). The :v1 key is no longer read ; the user gets the
    // new defaults rather than a partially-hydrated form.
    localStorage.setItem(
      'screener-filter:v1',
      JSON.stringify({
        gapPctMin: 7.5,
        volumeRatioMin: 4,
        marketCapMin: 3_000_000_000,
        marketCapMax: 8_000_000_000,
        exchange: 'NASDAQ',
        sector: 'Technology',
      }),
    );
    expect(repo.load()).toBeNull();
  });

  it('returns null when the persisted blob is corrupt JSON', () => {
    localStorage.setItem('screener-filter:v2', '{not json');
    expect(repo.load()).toBeNull();
  });

  it('returns null when a required numeric field is missing', () => {
    // A future breaking schema change would land an older payload here ; we fall back to
    // defaults rather than hydrating the form with `undefined` thresholds.
    localStorage.setItem('screener-filter:v2', JSON.stringify({ volumeRatioMin: 3 }));
    expect(repo.load()).toBeNull();
  });

  it('returns null when a required numeric field is wrong-typed', () => {
    localStorage.setItem(
      'screener-filter:v2',
      JSON.stringify({ gapPctMin: '5', volumeRatioMin: 3 }),
    );
    expect(repo.load()).toBeNull();
  });
});
