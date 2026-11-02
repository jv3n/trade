import { Api, expect, isoToday, test } from '../fixtures';

/**
 * A stat and its trades share a day and a ticker (#865) : a trade left on another one than its stat
 * would read the wrong session and the wrong locates.
 *
 * What it pins, end to end :
 *
 * - the sheet of an existing stat has no field for its day or ticker ;
 * - past the page, the API refuses both changes, on the stat and on its trade ;
 * - a refused change leaves both as they were.
 */
const TICKER = 'KEPT';
const OTHER_TICKER = 'MOVD';
const DAY_MS = 24 * 60 * 60 * 1000;

interface Stat {
  id: string;
  ticker: string;
  tradeDate: string;
}

interface Trade {
  id: string;
  ticker: string;
  tradeDate: string;
  statEntryId: string | null;
}

function yesterday(): string {
  return new Date(Date.parse(isoToday()) - DAY_MS).toISOString().slice(0, 10);
}

function statRequest(overrides: Partial<Stat> = {}) {
  return {
    tradeDate: isoToday(),
    ticker: TICKER,
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
    ...overrides,
  };
}

async function seedTradedStat(api: Api): Promise<{ stat: Stat; trade: Trade }> {
  const stat = await api.post<Stat>('/api/stats', statRequest());
  const trade = await api.post<Trade>(`/api/stats/${stat.id}/trade`);
  return { stat, trade };
}

test('the sheet of a stat has no field for its day or ticker', async ({ api, page }) => {
  const { stat } = await seedTradedStat(api);

  await page.goto(`/stats?stat=${stat.id}`);

  await expect(page.getByRole('button', { name: 'Fermer' }).first()).toBeVisible();
  await expect(page.locator('.identity')).toHaveCount(0);
});

test('a traded stat refuses another ticker or day, and stays as it was', async ({ api }) => {
  const { stat } = await seedTradedStat(api);
  const path = `/api/stats/${stat.id}`;

  expect(await api.putStatus(path, statRequest({ ticker: OTHER_TICKER }))).toBe(400);
  expect(await api.putStatus(path, statRequest({ tradeDate: yesterday() }))).toBe(400);

  const kept = await api.get<Stat>(path);
  expect(kept.ticker).toBe(TICKER);
  expect(kept.tradeDate).toBe(isoToday());
});

test('a trade with a stat refuses another ticker or day, and stays linked', async ({ api }) => {
  const { stat, trade } = await seedTradedStat(api);
  const path = `/api/journal/trades/${trade.id}`;

  expect(await api.putStatus(path, { tradeDate: isoToday(), ticker: OTHER_TICKER })).toBe(400);
  expect(await api.putStatus(path, { tradeDate: yesterday(), ticker: TICKER })).toBe(400);

  const kept = await api.get<Trade>(path);
  expect(kept.ticker).toBe(TICKER);
  expect(kept.tradeDate).toBe(isoToday());
  expect(kept.statEntryId).toBe(stat.id);
});
