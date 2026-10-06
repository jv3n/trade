import { Locator, Page } from '@playwright/test';
import { Api, expect, isoToday, parseFrAmount, test, typeNumber } from '../fixtures';

/**
 * Locates end to end (#626) — the one figure the app computes twice, client-side for the live
 * preview and server-side when saved, and the one that moves money without a trade. The invariant :
 *
 * > What the account says the locates cost, and what every page shows, are the same number — and a
 * > locate never enters a trade's P&L.
 *
 * So every test reads at least two surfaces : Today's step, the dialogs, the account (its line, its
 * balance, its tile) and the trade sheet.
 *
 * - a locate typed on Today costs the account what the screen says, and the trade's P&L ignores it ;
 * - the client's and the server's rounding agree on an exact half-cent ;
 * - top-ups add up per ticker and for the day, while the account keeps one line per locate ;
 * - « paid for nothing » is the part on a ticker with no trade that day ;
 * - deleting a locate gives the money back, and a locate charged nothing writes no line ;
 * - a correction in place moves the account line ;
 * - the 2 % rule reads as a warning ;
 * - the share's price starts from the day's candidate, and nothing links them.
 *
 * Each test starts from a fresh account funded with one 10 000 $ deposit. Button names are matched
 * as substrings — a Material button's name carries its icon ligature (« key\nLouer »), see
 * `money.spec.ts`. Amounts are read back through `parseFrAmount`, never by string equality.
 */

interface Locate {
  id: string;
  cost: number;
}
interface Movement {
  type: string;
  amount: number;
  locateId: string | null;
}
interface Summary {
  balance: number;
  periodLocates: number;
  periodUnusedLocates: number;
}
interface Trade {
  id: string;
  retainedProfitDollars: number | null;
}

const DEPOSIT = 10000;
/** Short 100 at 4.20, covered at 4.00 : a retained P&L of 20 $. */
const TRADE_PNL = 20;

test.beforeEach(async ({ api }) => {
  await api.post('/api/account/movements', {
    type: 'DEPOSIT',
    amount: DEPOSIT,
    valueDate: isoToday(),
    note: 'Dépôt initial',
  });
});

test("a locate typed on Today costs the account what the screen says, and the trade's P&L ignores it", async ({
  api,
  page,
}) => {
  const trade = await seedTrade(api, 'SGBX');

  await page.goto('/today');
  await page.getByRole('button', { name: 'Louer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau locate' });
  await dialog.getByLabel('Ticker').fill('SGBX');
  await typeNumber(dialog.getByLabel('Actions louées'), '2000');
  await typeNumber(dialog.getByLabel('$ / action'), '0.03');
  await expect(dialog.locator('.cost strong')).toContainText('60,00');
  await dialog.getByRole('button', { name: 'Louer' }).click();

  // Today's step : the day's total.
  await expect(locatesStep(page)).toContainText('SGBX');
  expect(parseFrAmount(await locatesStep(page).locator('.step-time').innerText())).toBe(60);

  // The account : one line, −cost, labelled with its ticker and shares, and the balance.
  await openAccountLocates(page);
  const line = locateLines(page);
  await expect(line).toHaveCount(1);
  await expect(line).toContainText('SGBX');
  await expect(line).toContainText('actions louées');
  expect(parseFrAmount(await amountOf(line))).toBe(-60);
  await expect
    .poll(async () => parseFrAmount(await heroBalance(page).innerText()))
    .toBe(DEPOSIT + TRADE_PNL - 60);

  // The trade of that day and ticker : the locate is shown, and its P&L does not move.
  expect((await api.get<Trade>(`/api/journal/trades/${trade.id}`)).retainedProfitDollars).toBe(
    TRADE_PNL,
  );
  await page.goto(`/journal/${trade.id}`);
  expect(parseFrAmount(await dayLocates(page).locator('strong').innerText())).toBe(60);
});

// 350 × 0.0107 = 3.745 : the float product is 3.7449999…, a naive client shows 3,74 (#621).
test('the preview and the saved line agree on an exact half-cent', async ({ api, page }) => {
  await page.goto('/account');
  await page.getByRole('button', { name: 'Locate' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau locate' });
  await dialog.getByLabel('Ticker').fill('ATXG');
  await typeNumber(dialog.getByLabel('Actions louées'), '350');
  await typeNumber(dialog.getByLabel('$ / action'), '0.0107');
  expect(parseFrAmount(await dialog.locator('.cost strong').innerText())).toBe(3.75);
  await dialog.getByRole('button', { name: 'Louer' }).click();

  // Typed under the default « Trades » filter : the page switches to « Locates » to show it (#629).
  await expect(locateLines(page)).toHaveCount(1);
  expect(parseFrAmount(await amountOf(locateLines(page)))).toBe(-3.75);
  expect((await locateMovements(api))[0].amount).toBe(-3.75);
});

test('top-ups add up per ticker and for the day, while the account keeps one line per locate', async ({
  api,
  page,
}) => {
  const trade = await seedTrade(api, 'SGBX');
  await seedLocate(api, 'SGBX', 2000, 0.04, 2.5);
  await seedLocate(api, 'SGBX', 500, 0.06, 2.4);
  await seedLocate(api, 'MLGO', 1000, 0.03, 2.5);

  // Today : one row per ticker, the shares summed.
  await page.goto('/today');
  const rows = locatesStep(page).locator('.locate-link');
  await expect(rows).toHaveCount(2);
  const sgbx = rows.filter({ hasText: 'SGBX' });
  expect(parseFrAmount(await sgbx.innerText())).toBe(2500);

  // The dialog's total row : shares and cost.
  await sgbx.click();
  const total = page.getByRole('dialog').getByTestId('locates-total');
  expect(parseFrAmount(await total.locator('td').nth(0).innerText())).toBe(2500);
  expect(parseFrAmount(await total.locator('td').nth(3).innerText())).toBe(110);
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();

  // The trade sheet : the shares and the blended weight — 110 paid on 6 200 of shares, 1,77 %.
  await page.goto(`/journal/${trade.id}`);
  // The French group separator is a narrow no-break space.
  await expect(dayLocates(page)).toContainText(/2\s500\sactions/);
  await expect(dayLocates(page)).toContainText('1,77 %');

  // The account : one line per locate, not per ticker.
  await openAccountLocates(page);
  await expect(locateLines(page)).toHaveCount(3);
});

// On a day already over : the New York close (16:00, server-side) is pinned by the backend's tests.
test('« paid for nothing » is the part on a ticker with no trade that day', async ({ api }) => {
  // SGBX traded, MLGO not.
  const past = previousBusinessDay();
  await seedTrade(api, 'SGBX', past);
  await seedLocate(api, 'SGBX', 2000, 0.05, 2.5, past);
  const mlgo = await seedLocate(api, 'MLGO', 1000, 0.03, 2.5, past);

  const overDay = await api.get<Summary>(`/api/account/summary?dateFrom=${past}&dateTo=${past}`);
  expect(overDay.periodLocates).toBe(-130);
  expect(overDay.periodUnusedLocates).toBe(-mlgo.cost);
});

test('deleting a locate gives the money back, and a locate charged nothing writes no line', async ({
  api,
  page,
}) => {
  await seedLocate(api, 'ATXG', 1000, 0.05, 2.5);

  await openAccountLocates(page);
  const line = locateLines(page);
  await expect(line).toHaveCount(1);
  await expect
    .poll(async () => parseFrAmount(await heroBalance(page).innerText()))
    .toBe(DEPOSIT - 50);
  // Never edited as a movement : its one action deletes the locate itself.
  await expect(line.getByRole('button', { name: 'Modifier' })).toHaveCount(0);

  await line.getByRole('button', { name: 'Supprimer le locate' }).click();
  await page
    .getByRole('dialog', { name: 'Supprimer ce locate ATXG ?' })
    .getByRole('button', { name: 'Supprimer' })
    .click();
  await expect(locateLines(page)).toHaveCount(0);
  // The table and the KPI row reload apart : the balance is waited for, not read once.
  await expect.poll(async () => parseFrAmount(await heroBalance(page).innerText())).toBe(DEPOSIT);
  expect(await api.get<Locate[]>(`/api/locates?date=${isoToday()}`)).toHaveLength(0);

  await seedLocate(api, 'NUKK', 1000, 0, null);
  expect(await locateMovements(api)).toHaveLength(0);
});

test('a correction in place moves the account line, with no confirmation', async ({
  api,
  page,
}) => {
  await seedLocate(api, 'SGBX', 1000, 0.05, 2.5);

  await page.goto('/today');
  await locatesStep(page).locator('.locate-link').filter({ hasText: 'SGBX' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Corriger' }).click();
  // Scoped to the row : the add form below has a « $ / action » field too.
  const editing = dialog.locator('tr.editing');
  await retype(editing.getByLabel('Actions', { exact: true }), '1500');
  await retype(editing.getByLabel('$ / action', { exact: true }), '0.04');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();

  await expect.poll(async () => (await locateMovements(api))[0]?.amount).toBe(-60);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Fermer' }).click();

  await openAccountLocates(page);
  expect(parseFrAmount(await amountOf(locateLines(page)))).toBe(-60);
  await expect
    .poll(async () => parseFrAmount(await heroBalance(page).innerText()))
    .toBe(DEPOSIT - 60);
});

test('the 2 % rule reads as a warning, per locate and for the day', async ({ api, page }) => {
  const trade = await seedTrade(api, 'SGBX');
  // 0.06 on 2.50 = 2.40 % and 0.06 on 2.40 = 2.50 % : over the rule, and so is the day's blend.
  await seedLocate(api, 'SGBX', 1000, 0.06, 2.5);
  await seedLocate(api, 'SGBX', 500, 0.06, 2.4);
  // 0.04 on 2.50 = 1.60 % : under it.
  await seedLocate(api, 'MLGO', 1000, 0.04, 2.5);

  await page.goto('/today');
  await locatesStep(page).locator('.locate-link').filter({ hasText: 'SGBX' }).click();
  const dialog = page.getByRole('dialog');
  await expect(percentCell(dialog.locator('.locate-list tbody tr').first())).toHaveClass(/warn/);
  await expect(dialog.getByTestId('locates-total').locator('td').nth(2)).toHaveClass(/warn/);
  await dialog.getByRole('button', { name: 'Fermer' }).click();

  await locatesStep(page).locator('.locate-link').filter({ hasText: 'MLGO' }).click();
  await expect(percentCell(dialog.locator('.locate-list tbody tr').first())).not.toHaveClass(
    /warn/,
  );
  await dialog.getByRole('button', { name: 'Fermer' }).click();

  await page.goto(`/journal/${trade.id}`);
  await expect(dayLocates(page).locator('.warn')).toHaveCount(3);
});

test("the share's price starts from the day's candidate, and nothing links them", async ({
  api,
  page,
}) => {
  await api.post('/api/candidates', {
    tradingDate: isoToday(),
    ticker: 'SGBX',
    previousClose: 1.12,
    pmOpen: 1.85,
    pmHigh: 2.46,
  });

  await page.goto('/today');
  await page.getByRole('button', { name: 'Louer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau locate' });
  const stockPrice = dialog.getByLabel("Prix de l'action ($)");
  await dialog.getByLabel('Ticker').fill('SGBX');
  await expect.poll(async () => parseFrAmount(await stockPrice.inputValue())).toBe(1.85);
  await dialog.getByLabel('Ticker').fill('ZZZZ');
  await expect(stockPrice).toHaveValue('');
  await dialog.getByRole('button', { name: 'Annuler' }).click();

  // The other way round : a locate typed before its trade exists still shows on that trade.
  await seedLocate(api, 'NUKK', 1000, 0.05, 2.5);
  const trade = await seedTrade(api, 'NUKK');
  await page.goto(`/journal/${trade.id}`);
  expect(parseFrAmount(await dayLocates(page).locator('strong').innerText())).toBe(50);
});

// ---------------------------------------------------------------------------

/** A stat of [day] on [ticker], promoted to a closed short 100 at 4.20 → 4.00 (P&L 20 $). */
async function seedTrade(api: Api, ticker: string, day = isoToday()): Promise<Trade> {
  const stat = await api.post<{ id: string }>('/api/stats', {
    tradeDate: day,
    ticker,
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
  });
  const trade = await api.post<Trade>(`/api/stats/${stat.id}/trade`);
  return api.put<Trade>(`/api/journal/trades/${trade.id}`, {
    statEntryId: stat.id,
    tradeDate: day,
    ticker,
    direction: 'SHORT',
    executions: [
      { kind: 'ENTRY', shares: 100, price: 4.2 },
      { kind: 'EXIT', shares: 100, price: 4.0 },
    ],
  });
}

async function seedLocate(
  api: Api,
  ticker: string,
  shares: number,
  pricePerShare: number,
  stockPrice: number | null,
  day = isoToday(),
): Promise<Locate> {
  return api.post<Locate>('/api/locates', {
    tradingDate: day,
    ticker,
    shares,
    pricePerShare,
    stockPrice,
  });
}

async function locateMovements(api: Api): Promise<Movement[]> {
  return (await api.get<{ content: Movement[] }>('/api/account/movements?type=LOCATE&size=100'))
    .content;
}

/** The locates step of Today — the fourth row, between the candidates and the session. */
function locatesStep(page: Page): Locator {
  return page.locator('ol.steps > li.step').nth(3);
}

/** The account, its table narrowed to the locates — the default « Trades » filter hides them. */
async function openAccountLocates(page: Page): Promise<void> {
  await page.goto('/account');
  await page.getByRole('combobox', { name: 'Type de mouvement' }).click();
  await page.getByRole('option', { name: 'Locates', exact: true }).click();
}

/** The account's LOCATE lines. */
function locateLines(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: 'actions louées' });
}

/** Columns : date, type, label, amount, balance, actions. */
async function amountOf(line: Locator): Promise<string> {
  return line.getByRole('cell').nth(3).innerText();
}

/** Columns : shares, price, % of price, cost, actions. */
function percentCell(row: Locator): Locator {
  return row.locator('td').nth(2);
}

function dayLocates(page: Page): Locator {
  return page.getByTestId('day-locates');
}

function heroBalance(page: Page): Locator {
  return page.getByTestId('account-balance').locator('.kpi__value');
}

/** Clears a number field first : `typeNumber` types after what is there. */
async function retype(field: Locator, value: string): Promise<void> {
  await field.focus();
  await field.press('ControlOrMeta+a');
  await field.press('Delete');
  await typeNumber(field, value);
}

/** The trading day before today, weekends skipped, on the New York calendar. */
function previousBusinessDay(): string {
  const [year, month, day] = isoToday().split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  do {
    date.setUTCDate(date.getUTCDate() - 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}
