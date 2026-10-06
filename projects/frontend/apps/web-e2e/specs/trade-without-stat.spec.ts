import { Locator, Page } from '@playwright/test';
import { expect, test, typeNumber } from '../fixtures';

/**
 * A trade on its own (#634) — the one an import or a session typed after the fact needs : no stat
 * behind it, so no measurement invented to hold it.
 *
 * What it pins, end to end :
 *
 * - « + Trade » on the journal creates it, with the direction picked, and opens its sheet ;
 * - the sheet says it has no stat, and its fills and P&L are typed like any other ;
 * - its P&L reaches the account, and the journal lists it.
 */
const TICKER = 'SOLO';

interface Trade {
  id: string;
  statEntryId: string | null;
  direction: string | null;
  retainedProfitDollars: number | null;
}
interface Movement {
  amount: number;
  tradeEntryId: string | null;
}

test('a trade created from the journal stands without a stat, and reaches the account', async ({
  api,
  page,
}) => {
  await page.goto('/journal');
  await page.getByRole('button', { name: /Trade$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau trade' });
  await dialog.getByLabel('Ticker').fill(TICKER.toLowerCase());
  await pickOption(page, dialog.getByLabel('Sens'), 'Long (buy)');
  await dialog.getByRole('button', { name: 'Créer le trade' }).click();

  await expect(page).toHaveURL(/\/journal\/[0-9a-f-]+$/);
  const id = page.url().split('/').pop()!;
  await expect(page.getByTestId('no-stat')).toBeVisible();
  await expect(page.getByTestId('context-no-stat')).toBeVisible();

  // Long 100 at 9.00, sold at 9.50 : a P&L of 50 $.
  await addFill(page, 0, '9.00');
  await addFill(page, 1, '9.50');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText(`Trade ${TICKER} mis à jour.`)).toBeVisible();

  const trade = await api.get<Trade>(`/api/journal/trades/${id}`);
  expect(trade.statEntryId).toBeNull();
  expect(trade.direction).toBe('BUY');
  expect(trade.retainedProfitDollars).toBe(50);
  const movements = (
    await api.get<{ content: Movement[] }>('/api/account/movements?type=TRADE&size=100')
  ).content;
  expect(movements.filter((m) => m.tradeEntryId === id).map((m) => m.amount)).toEqual([50]);

  await page.goto('/journal');
  await expect(page.locator('.journal-row').filter({ hasText: TICKER })).toHaveCount(1);
});

async function addFill(page: Page, index: number, price: string): Promise<void> {
  await page.getByRole('button', { name: 'Ajouter une exécution' }).click();
  await typeNumber(page.getByLabel('Actions', { exact: true }).nth(index), '100');
  await typeNumber(page.getByLabel('Prix', { exact: true }).nth(index), price);
}

async function pickOption(page: Page, select: Locator, option: string): Promise<void> {
  await select.click();
  await page.getByRole('option', { name: option }).click();
}
