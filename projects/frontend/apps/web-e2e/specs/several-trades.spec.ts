import { Locator, Page } from '@playwright/test';
import { Api, expect, isoToday, test, typeNumber } from '../fixtures';

/**
 * Several trades on one stat (#500, #504) — the path the owner takes when they trade the same name
 * twice in a day : a short in the morning, then a long on the bounce, each created by hand from the
 * stat and filled on its own sheet.
 *
 * What it pins, end to end :
 *
 * - the stat keeps offering a trade once it has one (« + ») ;
 * - the stats row shows one tag per trade ;
 * - the journal shows **one** row for the ticker and day, opened onto its two trades ;
 * - each sheet lists the stat's trades in its header.
 */
const TICKER = 'TWIN';

test('a short and a long on one stat : two tags on the stat, one journal row', async ({
  api,
  page,
}) => {
  test.setTimeout(120_000);
  await seedStat(api);

  await createTrade(page, 'Trade');
  await fill(page, 'Short', '10.00', '9.00');

  await createTrade(page, 'Un autre trade sur cette stat');
  await fill(page, 'Long (buy)', '9.00', '9.50');
  await expect(page.locator('.sibling-tag')).toHaveCount(2);

  await page.goto('/stats');
  await page.getByPlaceholder('Rechercher un ticker…').fill(TICKER);
  await expect(statRow(page).locator('.trade-link')).toHaveCount(2);

  await page.goto('/journal');
  const rows = page.locator('.journal-row').filter({ hasText: TICKER });
  await expect(rows).toHaveCount(1);
  await rows.click();
  await expect(page.locator('.day-trade')).toHaveCount(2);
});

/** Creates the stat's next trade from its row — [button] is « Trade » or the « + ». */
async function createTrade(page: Page, button: string): Promise<void> {
  await page.goto('/stats');
  await page.getByPlaceholder('Rechercher un ticker…').fill(TICKER);
  await statRow(page).getByRole('button', { name: button, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Créer le trade' }).click();
  await expect(page).toHaveURL(/\/journal\/[0-9a-f-]+$/);
}

/** One entry and one exit of 100 shares on the open sheet, then saved. */
async function fill(page: Page, direction: string, entry: string, exit: string): Promise<void> {
  await pickOption(page, page.getByLabel('Sens'), direction);
  await page.getByRole('button', { name: 'Ajouter une exécution' }).click();
  await typeNumber(page.getByLabel('Actions', { exact: true }).nth(0), '100');
  await typeNumber(page.getByLabel('Prix', { exact: true }).nth(0), entry);
  await page.getByRole('button', { name: 'Ajouter une exécution' }).click();
  await typeNumber(page.getByLabel('Actions', { exact: true }).nth(1), '100');
  await typeNumber(page.getByLabel('Prix', { exact: true }).nth(1), exit);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText(`Trade ${TICKER} mis à jour.`)).toBeVisible();
}

function statRow(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: TICKER });
}

async function pickOption(page: Page, select: Locator, option: string): Promise<void> {
  await select.click();
  await page.getByRole('option', { name: option }).click();
}

async function seedStat(api: Api): Promise<void> {
  await api.post('/api/stats', {
    tradeDate: isoToday(),
    ticker: TICKER,
    previousClose: 6.2,
    pmOpen: 9.6,
    pmHigh: 10.4,
  });
}
