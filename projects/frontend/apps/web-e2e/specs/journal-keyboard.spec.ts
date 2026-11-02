import { Locator, Page } from '@playwright/test';

import { Api, expect, isoToday, test } from '../fixtures';

/**
 * A journal row opens from the keyboard (#869), the mouse being no longer the only way in :
 *
 * - a single-trade row has a button, invisible until it takes the focus, that opens the sheet ;
 * - a row of several has its chevron as a button, which opens onto the trades and says so.
 */
const TICKER = 'KEYS';

interface Stat {
  id: string;
}

interface Trade {
  id: string;
}

async function seedTrades(api: Api, count: number): Promise<Trade[]> {
  const stat = await api.post<Stat>('/api/stats', {
    tradeDate: isoToday(),
    ticker: TICKER,
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
  });
  const trades: Trade[] = [];
  for (let i = 0; i < count; i++) {
    trades.push(await api.post<Trade>(`/api/stats/${stat.id}/trade`));
  }
  return trades;
}

/** A real Tab walk : a script's `focus()` says nothing of what a keyboard user gets. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 100; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }
  throw new Error('Tab never reached the target');
}

test('the arrow of a single-trade row shows when Tab reaches it, and Enter opens the sheet', async ({
  api,
  page,
}) => {
  const [trade] = await seedTrades(api, 1);

  await page.goto('/journal');
  const open = page.getByRole('button', { name: `Ouvrir le trade ${TICKER}` });
  await expect(open).toHaveCSS('opacity', '0');

  await tabTo(page, open);
  await expect(open).toHaveCSS('opacity', '1');

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/journal/${trade.id}$`));
});

// The reason for `:focus-visible` over `:focus` : the arrow must not flash under a click on the row.
test('the arrow of a single-trade row stays hidden when the mouse takes the focus', async ({
  api,
  page,
}) => {
  await seedTrades(api, 1);

  await page.goto('/journal');
  const open = page.getByRole('button', { name: `Ouvrir le trade ${TICKER}` });
  await open.hover();
  await page.mouse.down();

  await expect(open).toBeFocused();
  await expect(open).toHaveCSS('opacity', '0');
});

test('Enter on a row of several opens onto its trades', async ({ api, page }) => {
  await seedTrades(api, 2);

  await page.goto('/journal');
  const open = page.getByRole('button', { name: `Afficher les trades ${TICKER} du jour` });
  await open.focus();
  await page.keyboard.press('Enter');

  await expect(open).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: /Trade 2/ })).toBeVisible();
});
