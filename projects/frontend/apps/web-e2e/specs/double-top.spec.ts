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
 * - the points are named BARES (#716) — Base, Apex, Rejection, Echo, Sink — the legs by the point
 *   they reach : A, R, E, S ;
 * - the four prices save field by field, the legs read like the mockup's SGBX ;
 * - their four times (#469) give each leg its duration ;
 * - the drop after the retest (#706), required to tick since #710 : the retest stayed under the top ;
 * - the DT view counts that double top, the GUS view doesn't.
 *
 * Prices are the SGBX of `mockup/stats.html` : Base 1.90 (the open), Apex 2.95, Rejection 2.36, Echo
 * 2.85 — A +55.3 %, R −20.0 %, E +20.8 %, 3.4 % under the Apex
 * — at 10:02, 10:14, 10:21 and 10:38 : A 12 min, R 7 min, E 17 min, 36 min in all.
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
  dtDropPrice: number | null;
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
  await expect(card.getByText('1 / 5 prix · 0 / 5 heures')).toBeVisible();

  // ---- The three other prices, the legs computed as they come ----
  await typeNumber(card.getByLabel('Apex ($)'), '2.95');
  await expect(card.getByText('A 55,3 %', { exact: true })).toBeVisible();
  await typeNumber(card.getByLabel('Rejection ($)'), '2.36');
  await expect(card.getByText(/R [-−]20,0 % depuis l'Apex/)).toBeVisible();
  await typeNumber(card.getByLabel('Echo ($)', { exact: true }), '2.85');
  await expect(card.getByText(/E 20,8 % · [-−]3,4 % de l'Apex/)).toBeVisible();
  await expect(card.getByText('4 / 5 prix · 0 / 5 heures')).toBeVisible();
  await expect
    .poll(async () => (await api.get<Stat>(`/api/stats/${dtId}`)).dtRetestPrice)
    .toBe(2.85);

  // ---- The four times, each leg's duration read as they come (#469) ----
  await typeTime(card.getByLabel('Heure de la Base'), '10:02');
  await typeTime(card.getByLabel("Heure de l'Apex"), '10:14');
  await expect(card.getByText('A · 12 min')).toBeVisible();
  await typeTime(card.getByLabel('Heure de la Rejection'), '10:21');
  await expect(card.getByText('R · 7 min')).toBeVisible();
  await typeTime(card.getByLabel("Heure de l'Echo"), '10:38');
  await expect(card.getByText('E · 17 min · total 36 min')).toBeVisible();
  await expect(card.getByText('4 / 5 prix · 4 / 5 heures')).toBeVisible();
  await expect
    .poll(async () => (await api.get<Stat>(`/api/stats/${dtId}`)).dtRetestTime)
    .toMatch(/^10:38/);

  // ---- The Sink after the Echo (#706), required since #710 : read as the short's gain ----
  await typeTime(card.getByLabel('Heure du Sink'), '11:03');
  await typeNumber(card.getByLabel('Sink ($)'), '2.30');
  await expect(
    card.getByText(/S \+19,3 % pour le short · \+17,9 % à l'entrée de la fiche/),
  ).toBeVisible();
  await expect(card.getByText('S · 25 min')).toBeVisible();
  await expect(card.getByText('5 / 5 prix · 5 / 5 heures')).toBeVisible();
  await expect.poll(async () => (await api.get<Stat>(`/api/stats/${dtId}`)).dtDropPrice).toBe(2.3);

  // ---- Ticked with its five prices and times ----
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
