import { Page } from '@playwright/test';
import { Api, expect, isoToday, parseFrAmount, test } from '../fixtures';

/**
 * Deleting a stat that has a trade (#635) — how the stats invented to hold an import go away
 * without taking the real trades along.
 *
 * What it pins, end to end :
 *
 * - the confirmation warns that a trade is attached and stays ;
 * - the stat leaves the sheet, the trade stays in the journal, unlinked, its P&L untouched ;
 * - the account line and the balance do not move.
 */
const TICKER = 'GONE';
const DEPOSIT = 10000;

interface Trade {
  id: string;
  statEntryId: string | null;
  retainedProfitDollars: number | null;
}

test('a traded stat is deleted, its trade stays in the journal and on the account', async ({
  api,
  page,
}) => {
  await api.post('/api/account/movements', {
    type: 'DEPOSIT',
    amount: DEPOSIT,
    valueDate: isoToday(),
    note: 'Dépôt initial',
  });
  const trade = await seedTrade(api);

  await page.goto('/stats');
  await page.getByPlaceholder('Rechercher un ticker…').fill(TICKER);
  const row = page.getByRole('row').filter({ hasText: TICKER });
  await row.getByRole('button', { name: 'Supprimer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Supprimer la stat ${TICKER} ?` });
  await expect(dialog).toContainText('il reste au journal, sans stat');
  await dialog.getByRole('button', { name: 'Supprimer la stat' }).click();
  await expect(row).toHaveCount(0);

  const kept = await api.get<Trade>(`/api/journal/trades/${trade.id}`);
  expect(kept.statEntryId).toBeNull();
  expect(kept.retainedProfitDollars).toBe(20);

  await page.goto(`/journal/${trade.id}`);
  await expect(page.getByTestId('no-stat')).toBeVisible();

  await page.goto('/account');
  await expect
    .poll(async () => parseFrAmount(await heroBalance(page).innerText()))
    .toBe(DEPOSIT + 20);
});

/** A stat promoted to a closed short 100 at 4.20 → 4.00 (P&L 20 $). */
async function seedTrade(api: Api): Promise<Trade> {
  const stat = await api.post<{ id: string }>('/api/stats', {
    tradeDate: isoToday(),
    ticker: TICKER,
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
  });
  const trade = await api.post<Trade>(`/api/stats/${stat.id}/trade`);
  return api.put<Trade>(`/api/journal/trades/${trade.id}`, {
    tradeDate: isoToday(),
    ticker: TICKER,
    direction: 'SHORT',
    executions: [
      { kind: 'ENTRY', shares: 100, price: 4.2 },
      { kind: 'EXIT', shares: 100, price: 4.0 },
    ],
  });
}

function heroBalance(page: Page) {
  return page.getByTestId('account-balance').locator('.kpi__value');
}
