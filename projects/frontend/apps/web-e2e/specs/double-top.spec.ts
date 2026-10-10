import { Locator, Page } from '@playwright/test';
import { Api, expect, isoToday, test, typeNumber } from '../fixtures';

/**
 * The GUS then DT day (#438, epic #428) — one candidate, two stats : SGBX is promoted as a GUS in
 * the morning, forms a double top late in the morning and gets a DT stat of its own. What is pinned,
 * end to end :
 *
 * - « → GUS » then « → DT » on the same candidate leave one badge per stat ;
 * - the DT badge opens the « Double top » card in the DT view, its start pre-filled with the open,
 *   and the stat carries no premarket (#649) ;
 * - the four prices save field by field, the legs read like the mockup's SGBX ;
 * - their four times (#469) give each leg its duration, and the stat ticks with prices and times ;
 * - the DT view counts that double top, the GUS view doesn't.
 *
 * Prices are the SGBX of `mockup/stats.html` : open 1.90, top 2.95, rejection low 2.36, retest 2.85
 * — A +55.3 %, B −20.0 %, C +20.8 %, 3.4 % under the top
 * — at 10:02, 10:14, 10:21 and 10:38 : A 12 min, B 7 min, C 17 min, 36 min in all.
 */

const TICKER = 'SGBX';

interface Candidate {
  ticker: string;
  openPrice: number | null;
  stats: { pattern: string; statId: string }[];
}
interface Stat {
  id: string;
  pmOpen: number | null;
  dtStartPrice: number | null;
  dtRetestPrice: number | null;
  dtRetestTime: string | null;
  completed: boolean;
}

test('a candidate promoted in GUS then in DT is filled and ticked as a double top', async ({
  api,
  page,
}) => {
  // ---- Premarket : the capture, then the open at 9:30 ----
  await page.goto('/candidates');
  await page.getByLabel('Ticker').fill(TICKER);
  await typeNumber(page.getByLabel('Clôture veille ($)'), '1.12');
  await typeNumber(page.getByLabel('Open PM 4h00 ($)'), '1.85');
  await typeNumber(page.getByLabel('High PM ($)'), '2.46');
  await page.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByText(`${TICKER} ajouté.`)).toBeVisible();
  await typeNumber(page.getByLabel(`Open de ${TICKER}`), '1.90');
  await expect.poll(async () => (await candidateOf(api))?.openPrice).toBe(1.9);

  // ---- The morning : a GUS stat ----
  await promote(page, 'GUS');

  // ---- Late in the morning : the same candidate forms a double top ----
  await promote(page, 'DT');
  await expect(page.getByRole('link', { name: 'GUS', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'DT', exact: true })).toBeVisible();
  const stats = (await candidateOf(api))!.stats;
  expect(stats.map((s) => s.pattern)).toEqual(['GUS', 'DT']);
  const dtId = stats.find((s) => s.pattern === 'DT')!.statId;
  // Promoted after the open was typed : the double top starts from it.
  const promoted = await api.get<Stat>(`/api/stats/${dtId}`);
  expect(promoted.dtStartPrice).toBe(1.9);
  expect(promoted.pmOpen).toBeNull();

  // ---- The DT badge opens the double top card, in the DT view ----
  await page.getByRole('link', { name: 'DT', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/stats\\?stat=${dtId}`));
  await expect(page.getByRole('radio', { name: 'DT', exact: true })).toBeChecked();
  const card = page.locator('.complete-card');
  await expect(card.getByRole('heading', { name: /Double top/ })).toBeVisible();
  await expect(card.getByText('1 / 4 prix · 0 / 4 heures')).toBeVisible();

  // ---- The three other prices, the legs computed as they come ----
  await typeNumber(card.getByLabel('Top ($)'), '2.95');
  await expect(card.getByText('A 55,3 %', { exact: true })).toBeVisible();
  await typeNumber(card.getByLabel('Bas du rejet ($)'), '2.36');
  await expect(card.getByText(/B [-−]20,0 % depuis le top/)).toBeVisible();
  await typeNumber(card.getByLabel('Retest ($)'), '2.85');
  await expect(card.getByText(/C 20,8 % · [-−]3,4 % du top/)).toBeVisible();
  await expect(card.getByText('4 / 4 prix · 0 / 4 heures')).toBeVisible();
  await expect
    .poll(async () => (await api.get<Stat>(`/api/stats/${dtId}`)).dtRetestPrice)
    .toBe(2.85);

  // ---- The four times, each leg's duration read as they come (#469) ----
  await typeTime(card.getByLabel('Heure du départ'), '10:02');
  await typeTime(card.getByLabel('Heure du top'), '10:14');
  await expect(card.getByText('A · 12 min')).toBeVisible();
  await typeTime(card.getByLabel('Heure du bas'), '10:21');
  await expect(card.getByText('B · 7 min')).toBeVisible();
  await typeTime(card.getByLabel('Heure du retest'), '10:38');
  await expect(card.getByText('C · 17 min · total 36 min')).toBeVisible();
  await expect(card.getByText('4 / 4 prix · 4 / 4 heures')).toBeVisible();
  await expect
    .poll(async () => (await api.get<Stat>(`/api/stats/${dtId}`)).dtRetestTime)
    .toMatch(/^10:38/);

  // ---- Ticked with its four prices and times ----
  await card.getByRole('button', { name: 'Marquer complétée' }).click();
  await expect.poll(async () => (await api.get<Stat>(`/api/stats/${dtId}`)).completed).toBe(true);

  // ---- The DT view counts it, the GUS view doesn't ----
  await expect(kpiValue(page, 'Stats DT complétées')).toHaveText('1');
  await page.getByRole('radio', { name: 'GUS', exact: true }).click();
  await expect(kpiValue(page, 'Stats GUS complétées')).toHaveText('0');
});

/** A native time field, typed then left : the card saves on blur. */
async function typeTime(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.blur();
}

/** « → GUS » / « → DT » on the row, confirmed in the modal. */
async function promote(page: Page, pattern: 'GUS' | 'DT'): Promise<void> {
  await page.getByRole('button', { name: pattern, exact: true }).click();
  await page
    .getByRole('dialog', { name: `Passer ${TICKER} en stat ${pattern} ?` })
    .getByRole('button', { name: `Passer en ${pattern}` })
    .click();
  await expect(page.getByText(`${TICKER} est passé en ${pattern}.`)).toBeVisible();
}

function kpiValue(page: Page, label: string) {
  return page.locator('.kpi').filter({ hasText: label }).locator('.kpi__value');
}

async function candidateOf(api: Api): Promise<Candidate | undefined> {
  const day = await api.get<Candidate[]>(`/api/candidates?date=${isoToday()}`);
  return day.find((c) => c.ticker === TICKER);
}
