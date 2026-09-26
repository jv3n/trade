import { Locator, Page } from '@playwright/test';
import { expect, isoToday, parseFrAmount, test, typeNumber } from '../fixtures';

/**
 * A full trading day, end to end (#367, scenario 1) — the money path, in one test, because it is
 * the only one that crosses every context and catches a broken link between two of them :
 *
 * capture a candidate in premarket → type the open at 9:30 → promote it to a GUS stat → reach that
 * stat through its « ✓ GUS » badge, even off the first page of the sheet (#383) → fill HOD / LOD / EOD
 * → tick it → promote it to a trade → type the executions and the broker P&L → **the account balance
 * moves by exactly that P&L** → re-file the stat under another pattern and **the trade follows** in
 * the journal (#393) — SIR, measured like a GUS : a double top is a stat of its own (#434).
 *
 * Button names are matched as substrings, except where a shorter name is contained in a longer one
 * (« GUS » in « Tout passer en GUS ») — see `money.spec.ts`.
 */

const TICKER = 'KTTA';
/** Short 350 KTTA 4,50 → 3,66 : 294,00 $ computed, 291,85 $ on the broker statement. */
const BROKER_PNL = 291.85;
/** Past the sheet's default page of 25 — the promoted stat is the oldest of the day. */
const OTHER_STATS = 30;

interface Stat {
  id: string;
  completed: boolean;
  tradeId: string | null;
  pattern: string;
}
interface Trade {
  id: string;
  pattern: string;
  retainedProfitDollars: number | null;
}

test('a full trading day moves the balance by the broker P&L, and the trade follows its stat', async ({
  api,
  page,
}) => {
  test.setTimeout(120_000);

  // ---- Premarket : the capture ----
  await page.goto('/candidates');
  await page.getByLabel('Ticker').fill(TICKER);
  await typeNumber(page.getByLabel('Clôture veille ($)'), '2.65');
  await typeNumber(page.getByLabel('Open PM 4h00 ($)'), '4.05');
  await typeNumber(page.getByLabel('High PM ($)'), '4.65');
  await typeNumber(page.getByLabel('Float'), '8.2');
  await page.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByText(`${TICKER} ajouté.`)).toBeVisible();

  // ---- 9:30 : the open ----
  await typeNumber(page.getByLabel(`Open de ${TICKER}`), '4.20');
  await expect.poll(async () => (await candidateOf(api))?.openPrice).toBe(4.2);

  // ---- The candidate becomes a stat ----
  await page.getByRole('button', { name: 'GUS', exact: true }).click();
  await page
    .getByRole('dialog', { name: `Passer ${TICKER} en stat GUS ?` })
    .getByRole('button', { name: 'Passer en GUS' })
    .click();
  await expect(page.getByText(`${TICKER} est passé en GUS.`)).toBeVisible();
  const statId = (await candidateOf(api))!.stats[0].statId;

  // Newer stats of the same day push this one off the sheet's first page.
  for (let i = 0; i < OTHER_STATS; i++) {
    await api.post('/api/stats', {
      tradeDate: isoToday(),
      ticker: `ZZ${String(i).padStart(2, '0')}`,
      previousClose: 1.5,
      pmOpen: 2,
      pmHigh: 2.2,
    });
  }

  // ---- The badge opens that stat's session, wherever it sits in the sheet (#383) ----
  await page.getByRole('link', { name: 'GUS', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/stats\\?stat=${statId}`));
  const premarket = page.locator('.premarket-card');
  await expect(premarket.getByText(TICKER, { exact: true })).toBeVisible();

  // ---- After the close : the session block, then the tick ----
  const session = page.locator('.complete-card');
  await typeNumber(session.getByLabel('HOD', { exact: true }), '4.80');
  await typeNumber(session.getByLabel('LOD', { exact: true }), '3.40');
  await typeNumber(session.getByLabel('Push open', { exact: true }), '4.60');
  await typeNumber(session.getByLabel('EOD', { exact: true }), '3.60');
  await session.getByRole('button', { name: 'Marquer complétée' }).click();
  await expect.poll(async () => (await api.get<Stat>(`/api/stats/${statId}`)).completed).toBe(true);

  // ---- The stat becomes a trade ----
  await session.getByRole('button', { name: 'Fermer' }).click();
  await page.getByPlaceholder('Rechercher un ticker…').fill(TICKER);
  await page
    .getByRole('row')
    .filter({ hasText: TICKER })
    .getByRole('button', { name: 'Trade', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: `Créer le trade ${TICKER} ?` })
    .getByRole('button', { name: 'Créer le trade' })
    .click();
  await expect(page).toHaveURL(/\/journal\/[0-9a-f-]+$/);
  const tradeId = (await api.get<Stat>(`/api/stats/${statId}`)).tradeId!;

  // ---- The executions and the broker P&L ----
  await pickOption(page, page.getByLabel('Sens'), 'Short');
  await page.getByRole('button', { name: 'Ajouter une exécution' }).click();
  await typeNumber(page.getByLabel('Actions', { exact: true }).nth(0), '350');
  await typeNumber(page.getByLabel('Prix', { exact: true }).nth(0), '4.50');
  await page.getByRole('button', { name: 'Ajouter une exécution' }).click();
  await typeNumber(page.getByLabel('Actions', { exact: true }).nth(1), '350');
  await typeNumber(page.getByLabel('Prix', { exact: true }).nth(1), '3.66');
  await typeNumber(page.getByTestId('real-pnl'), String(BROKER_PNL));
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText(`Trade ${TICKER} mis à jour.`)).toBeVisible();

  // ---- The account moved by exactly that P&L ----
  const trade = await api.get<Trade>(`/api/journal/trades/${tradeId}`);
  expect(trade.retainedProfitDollars).toBe(BROKER_PNL);
  expect((await api.get<{ balance: number }>('/api/account/summary')).balance).toBe(BROKER_PNL);
  await page.goto('/account');
  await expect
    .poll(async () => parseFrAmount(await page.locator('.kpi--hero .kpi__value').innerText()))
    .toBe(BROKER_PNL);

  // ---- Re-filed under another pattern, the trade follows (#393) ----
  await page.goto(`/stats?stat=${statId}`);
  await pickOption(page, premarket.getByLabel('Pattern'), 'SIR — Short Into Resistance');
  await expect.poll(async () => (await api.get<Stat>(`/api/stats/${statId}`)).pattern).toBe('SIR');
  expect((await api.get<Trade>(`/api/journal/trades/${tradeId}`)).pattern).toBe('SIR');
  await page.goto('/journal');
  const row = page.getByRole('row').filter({ hasText: TICKER });
  await expect(row.getByRole('cell', { name: 'SIR', exact: true })).toBeVisible();
});

interface Candidate {
  ticker: string;
  openPrice: number | null;
  stats: { pattern: string; statId: string }[];
}

async function candidateOf(api: {
  get<T>(path: string): Promise<T>;
}): Promise<Candidate | undefined> {
  const day = await api.get<Candidate[]>(`/api/candidates?date=${isoToday()}`);
  return day.find((c) => c.ticker === TICKER);
}

async function pickOption(page: Page, select: Locator, option: string): Promise<void> {
  await select.click();
  await page.getByRole('option', { name: option }).click();
}
