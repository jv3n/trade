import { Locator, Page } from '@playwright/test';
import { Api, expect, isoToday, newYorkTime, test } from '../fixtures';

/**
 * A quiet day can be done (#407) — nothing on the radar, no trade, and the Today page still
 * reaches 5 of 5 instead of reading « not done yet » into the evening :
 *
 * - « Aucun écart », « Aucun candidat aujourd'hui » and « Pas de trade aujourd'hui » settle the day
 *   in three clicks, and the marks survive a reload (they are stored per day) ;
 * - « Pas de trade » settles step 5 alone — a day with candidates and no trade is the common case ;
 * - **the data beats the mark** : a candidate captured afterwards puts step 2 back, and deleting it
 *   brings the mark back, as declared ; « Annuler » clears it.
 *
 * The clock is frozen at 17:00 in New York on the real date : the session step is only behind us
 * once New York has closed.
 */

/** The five steps, in order. */
const STEPS = ['reconciliation', 'candidates', 'session', 'stats', 'trades'] as const;
type Step = (typeof STEPS)[number];

test.beforeEach(async ({ api, page }) => {
  await page.clock.setFixedTime(newYorkTime(17, 0));
  await api.post('/api/account/movements', {
    type: 'DEPOSIT',
    amount: 10000,
    valueDate: isoToday(),
  });
});

test('a quiet day reaches 5 of 5 in three clicks, and stays there after a reload', async ({
  api,
  page,
}) => {
  await page.goto('/today');
  // 17:00 in New York : the session is behind us, whatever the runner's own clock says.
  await expect(step(page, 'session')).toHaveClass(/step--done/);

  await page.getByRole('button', { name: 'Aucun écart' }).click();
  await expect(step(page, 'reconciliation')).toHaveClass(/step--done/);
  await page.getByRole('button', { name: "Aucun candidat aujourd'hui" }).click();
  await expect(step(page, 'candidates')).toHaveClass(/step--none/);
  await expect(step(page, 'stats')).toHaveClass(/step--none/);
  await page.getByRole('button', { name: "Pas de trade aujourd'hui" }).click();
  await expect(step(page, 'trades')).toHaveClass(/step--none/);

  await expect(page.getByText('5 étapes faites sur 5')).toBeVisible();
  // A status, not an outcome : the « nothing today » steps are never the green of a done one.
  await expect(step(page, 'candidates')).not.toHaveClass(/step--done/);

  await page.reload();
  await expect(page.getByText('5 étapes faites sur 5')).toBeVisible();
  const day = await api.get<{ noCandidateAt: string | null; noTradeAt: string | null }>(
    `/api/trading-days/${isoToday()}`,
  );
  expect(day.noCandidateAt).not.toBeNull();
  expect(day.noTradeAt).not.toBeNull();
});

test('« Pas de trade » settles step 5 alone on a day with candidates', async ({ api, page }) => {
  await seedCandidate(api);
  await page.goto('/today');

  await page.getByRole('button', { name: "Pas de trade aujourd'hui" }).click();

  await expect(step(page, 'trades')).toHaveClass(/step--none/);
  await expect(step(page, 'candidates')).not.toHaveClass(/step--none/);
  await expect(page.getByRole('button', { name: "Aucun candidat aujourd'hui" })).toHaveCount(0);
});

test('a candidate captured after the mark wins over it, and « Annuler » clears it', async ({
  api,
  page,
}) => {
  await page.goto('/today');
  await page.getByRole('button', { name: "Aucun candidat aujourd'hui" }).click();
  await expect(step(page, 'candidates')).toHaveClass(/step--none/);

  const candidate = await seedCandidate(api);
  await page.reload();
  await expect(step(page, 'candidates')).not.toHaveClass(/step--none/);
  await expect(step(page, 'candidates')).toContainText('1 candidat saisi — KTTA.');

  // Stored as declared : the only candidate gone, the mark is back (PARCOURS › Accueil).
  await api.delete(`/api/candidates/${candidate.id}`);
  await page.reload();
  await expect(step(page, 'candidates')).toHaveClass(/step--none/);

  await step(page, 'candidates').getByRole('button', { name: 'Annuler' }).click();
  await expect(step(page, 'candidates')).not.toHaveClass(/step--none/);
  await expect(page.getByRole('button', { name: "Aucun candidat aujourd'hui" })).toBeVisible();
  expect(
    (await api.get<{ noCandidateAt: string | null }>(`/api/trading-days/${isoToday()}`))
      .noCandidateAt,
  ).toBeNull();
});

function step(page: Page, key: Step): Locator {
  return page.locator('ol.steps > li.step').nth(STEPS.indexOf(key));
}

async function seedCandidate(api: Api): Promise<{ id: string }> {
  return api.post<{ id: string }>('/api/candidates', {
    tradingDate: isoToday(),
    ticker: 'KTTA',
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
  });
}
