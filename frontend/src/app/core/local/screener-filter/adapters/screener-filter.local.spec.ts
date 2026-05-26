/**
 * Round-trip + defensive-decoding tests on [LocalStorageScreenerFilterRepository]. The contract
 * is "either we hand back a well-formed [ScreenerFilter] or `null` so the caller falls back to
 * defaults" — never a partially-hydrated object with `NaN` fields, never a thrown exception
 * (a corrupt blob shouldn't break the page).
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

  it('round-trips a full filter unchanged', () => {
    const filter: ScreenerFilter = {
      gapPctMin: 7.5,
      volumeRatioMin: 4,
      marketCapMin: 3_000_000_000,
      marketCapMax: 8_000_000_000,
      exchange: 'NASDAQ',
      sector: 'Technology',
    };
    repo.save(filter);

    expect(repo.load()).toEqual(filter);
  });

  it('round-trips a filter with null optional fields', () => {
    const filter: ScreenerFilter = {
      gapPctMin: 5,
      volumeRatioMin: 3,
      marketCapMin: null,
      marketCapMax: null,
      exchange: null,
      sector: null,
    };
    repo.save(filter);

    expect(repo.load()).toEqual(filter);
  });

  it('returns null when the persisted blob is corrupt JSON', () => {
    localStorage.setItem('screener-filter:v1', '{not json');
    expect(repo.load()).toBeNull();
  });

  it('returns null when a required numeric field is missing', () => {
    // A future breaking schema change would land an older payload here ; we fall back to
    // defaults rather than hydrating the form with `undefined` thresholds.
    localStorage.setItem(
      'screener-filter:v1',
      JSON.stringify({ volumeRatioMin: 3, marketCapMin: null }),
    );
    expect(repo.load()).toBeNull();
  });

  it('returns null when a required numeric field is wrong-typed', () => {
    localStorage.setItem(
      'screener-filter:v1',
      JSON.stringify({ gapPctMin: '5', volumeRatioMin: 3 }),
    );
    expect(repo.load()).toBeNull();
  });
});
