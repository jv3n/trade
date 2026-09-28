import { Locator, Page } from '@playwright/test';
import { Api, expect, isoToday, parseFrAmount, test, typeNumber } from '../fixtures';

/**
 * A reconciled morning stays true (#474, #482) — the seam the balance-drift bug lived in : a
 * morning reconciled in the panel, a line touched afterwards on the account page or in the journal,
 * and the balance read back on screen. `money.spec.ts` reconciles mornings ; this suite **touches a
 * line afterwards**, which is where the balance used to snap back to the last target and swallow
 * everything recorded since.
 *
 * The rule under test (#476) : on morning D the broker's balance already counted every movement
 * dated before D. A change to a movement dated d is absorbed by the first reconciled morning
 * strictly after d — its correction moves by the opposite amount, the balance does not — and with
 * no such morning the balance moves by exactly the change.
 *
 * 1. a change after the last morning counts in full ;
 * 2. a fix before a morning is absorbed by that morning — and not what was recorded since ;
 * 3. deleting a trade and re-creating it from its stat is a round trip, with no phantom pair ;
 * 4. a closed month stays closed : its correction and its gap tile do not move ;
 * 5. a clean morning gains a correction, and stays in the history ;
 * 6. the gap tile reads what the morning measured, not the correction it has become (#480).
 *
 * Throughout, the invariant `money.spec.ts` asserts : **the movements sum to the balance on
 * screen**. The `api` fixture only arranges (dated deposits, stats, a past morning) — never
 * through `POST /api/account/corrections`, whose corrections have no morning and stay frozen : a
 * state built on it would pass without testing anything. Acts and reads go through the UI.
 *
 * The fixtures are chosen so that the pre-#476 reconciler fails 2, 3 and 4 : something is
 * recorded after the morning before the old line is fixed (2), the trade is dated before the
 * morning (3), and the only correction left to re-float is the closed month's (4).
 *
 * Button names are matched as substrings — see `money.spec.ts`.
 */

interface Movement {
  type: string;
  amount: number;
}
interface Reconciliation {
  id: string;
}

const START = 10000;

test('a change after the last morning counts in full', async ({ api, page }) => {
  test.setTimeout(90_000);
  await deposit(api, START, daysAgo(1));
  await seedStat(api, 'AFTR', isoToday());
  await openAccount(page);
  await reconcileWithGap(page, '9987,60');

  await addDepositToday(page, '500');
  await recordTrade(page, 'AFTR', 300);

  await openAccount(page);
  await expectBalance(api, page, 9987.6 + 500 + 300);
  expect(await correctionOn(page, isoToday())).toBe(-12.4);
});

test('a fix before a morning is absorbed by that morning, and the cash since keeps counting', async ({
  api,
  page,
}) => {
  await deposit(api, START, daysAgo(1), 'Dépôt initial');
  await openAccount(page);
  await reconcileWithGap(page, '9987,60');
  // Recorded after the morning : the old reconciler swallowed it on the next edit.
  await addDepositToday(page, '500');

  await editDeposit(page, 'Dépôt initial', '10010');

  await expectBalance(api, page, 9987.6 + 500);
  expect(await correctionOn(page, isoToday())).toBe(-22.4);
  expect(await adjustments(api)).toHaveLength(1);
});

test('deleting a trade and re-creating it from its stat is a round trip', async ({ api, page }) => {
  test.setTimeout(120_000);
  await deposit(api, START, daysAgo(2));
  await seedStat(api, 'RTRP', daysAgo(1));
  const tradeUrl = await recordTrade(page, 'RTRP', 300);
  await openAccount(page);
  await reconcileWithGap(page, '10287,60');
  await expectBalance(api, page, 10287.6);

  await page.goto(tradeUrl);
  await page.locator('.header-actions').getByRole('button', { name: 'Supprimer' }).click();
  await page
    .getByRole('dialog', { name: 'Supprimer le trade RTRP ?' })
    .getByRole('button', { name: 'Supprimer le trade' })
    .click();
  await expect(page).toHaveURL(/\/journal$/);
  await recordTrade(page, 'RTRP', 300);

  await openAccount(page);
  await expectBalance(api, page, 10287.6);
  expect(await correctionOn(page, isoToday())).toBe(-12.4);
  // The pair the owner found in the ledger : a +300 and a −300 describing nothing.
  expect(await adjustments(api)).toHaveLength(1);
});

test('a closed month stays closed when a later row is edited', async ({ api, page }) => {
  const lastMonth = lastMonthOn(15);
  await deposit(api, START, lastMonthOn(10));
  await api.post('/api/account/reconciliations', { brokerBalance: 9987.6, valueDate: lastMonth });
  await deposit(api, 1000, isoToday(), 'Virement du jour');
  await openAccount(page);
  // Clean : the closed month's correction is the only one a re-float could reach.
  await page.getByRole('button', { name: 'Aucun écart' }).click();
  await expect(page.getByText('Rapproché ce matin — aucun écart.')).toBeVisible();

  await pickPeriod(page, 'Mois dernier');
  const tileBefore = await gapTile(page);
  expect(await correctionOn(page, lastMonth)).toBe(-12.4);

  await pickPeriod(page, 'Toutes périodes');
  await editDeposit(page, 'Virement du jour', '1100');

  await expectBalance(api, page, 9987.6 + 1100);
  await pickPeriod(page, 'Mois dernier');
  expect(await correctionOn(page, lastMonth)).toBe(-12.4);
  expect(await gapTile(page)).toBe(tileBefore);
});

test('a clean morning gains a correction when an earlier row is fixed, and stays in the history', async ({
  api,
  page,
}) => {
  await deposit(api, START, daysAgo(1), 'Dépôt initial');
  await openAccount(page);
  await page.getByRole('button', { name: 'Aucun écart' }).click();
  await expect(page.getByText('Rapproché ce matin — aucun écart.')).toBeVisible();

  await editDeposit(page, 'Dépôt initial', '10012,40');

  await expectBalance(api, page, START);
  expect(await correctionOn(page, isoToday())).toBe(-12.4);
  expect(await api.get<Reconciliation[]>('/api/account/reconciliations')).toHaveLength(1);
  await expect(page.getByText('Rapproché ce matin')).toBeVisible();
});

test('the gap tile reads what the morning measured, not the correction it has become', async ({
  api,
  page,
}) => {
  await deposit(api, START, daysAgo(1), 'Dépôt initial');
  await openAccount(page);
  await reconcileWithGap(page, '9987,60');

  await editDeposit(page, 'Dépôt initial', '10010');

  await expectBalance(api, page, 9987.6);
  expect(await correctionOn(page, isoToday())).toBe(-22.4);
  expect(await gapTile(page)).toBe(12.4);
});

// ---------------------------------------------------------------------------

/** The account page on every type and every date : the rows under test are not all trades. */
async function openAccount(page: Page): Promise<void> {
  await page.goto('/account');
  await pickPeriod(page, 'Toutes périodes');
  await page.getByRole('combobox', { name: 'Type de mouvement' }).click();
  await page.getByRole('option', { name: 'Tous les types' }).click();
}

async function pickPeriod(page: Page, preset: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Période', exact: true }).click();
  await page.getByRole('option', { name: preset, exact: true }).click();
}

async function reconcileWithGap(page: Page, brokerBalance: string): Promise<void> {
  await typeNumber(page.getByLabel('Solde TradeZero'), brokerBalance);
  await page.getByRole('button', { name: 'Créer la correction' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Créer la correction' }).click();
  await expect(page.getByText('Rapproché ce matin')).toBeVisible();
}

/** Through the « add a movement » dialog, which dates a new movement today. */
async function addDepositToday(page: Page, amount: string): Promise<void> {
  await page.getByRole('button', { name: 'Ajouter un mouvement' }).click();
  const dialog = page.getByRole('dialog');
  await typeNumber(dialog.getByLabel('Montant'), amount);
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Mouvement ajouté.')).toBeVisible();
}

async function editDeposit(page: Page, note: string, amount: string): Promise<void> {
  await page
    .getByRole('row')
    .filter({ hasText: note })
    .getByRole('button', { name: 'Modifier' })
    .click();
  const dialog = page.getByRole('dialog');
  const field = dialog.getByLabel('Montant');
  await field.clear();
  await typeNumber(field, amount);
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Mouvement mis à jour.')).toBeVisible();
}

/**
 * A short 100 whose P&L comes out at exactly [pnl], promoted from its stat and filled in the
 * journal — the path the owner takes. Returns the trade's page.
 */
async function recordTrade(page: Page, ticker: string, pnl: number): Promise<string> {
  await page.goto('/stats');
  await page.getByPlaceholder('Rechercher un ticker…').fill(ticker);
  await page
    .getByRole('row')
    .filter({ hasText: ticker })
    .getByRole('button', { name: 'Trade', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: `Créer le trade ${ticker} ?` })
    .getByRole('button', { name: 'Créer le trade' })
    .click();
  await expect(page).toHaveURL(/\/journal\/[0-9a-f-]+$/);

  await pickOption(page, page.getByLabel('Sens'), 'Short');
  await page.getByRole('button', { name: 'Ajouter une exécution' }).click();
  await typeNumber(page.getByLabel('Actions', { exact: true }).nth(0), '100');
  await typeNumber(page.getByLabel('Prix', { exact: true }).nth(0), '10.00');
  await page.getByRole('button', { name: 'Ajouter une exécution' }).click();
  await typeNumber(page.getByLabel('Actions', { exact: true }).nth(1), '100');
  await typeNumber(page.getByLabel('Prix', { exact: true }).nth(1), (10 - pnl / 100).toFixed(2));
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText(`Trade ${ticker} mis à jour.`)).toBeVisible();
  return page.url();
}

async function pickOption(page: Page, select: Locator, option: string): Promise<void> {
  await select.click();
  await page.getByRole('option', { name: option }).click();
}

/** The balance on screen reaches [expected], and the ledger sums to it. */
async function expectBalance(api: Api, page: Page, expected: number): Promise<void> {
  await expect
    .poll(async () => parseFrAmount(await heroBalance(page).innerText()))
    .toBeCloseTo(expected, 2);
  expect(await ledgerSum(api)).toBeCloseTo(expected, 2);
}

/** The amount of the correction dated [iso], as the movements table shows it. */
async function correctionOn(page: Page, iso: string): Promise<number> {
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Correction', exact: true }) })
    .filter({ hasText: frDate(iso) });
  await expect(row).toHaveCount(1);
  return parseFrAmount(await row.getByRole('cell').nth(3).innerText());
}

/** The reconciliation-gap tile's figure — unsigned, the label carries the direction. */
async function gapTile(page: Page): Promise<number> {
  const value = page.getByTestId('reconciliation-gap').locator('.kpi__value');
  await expect(value).toBeVisible();
  return parseFrAmount(await value.innerText());
}

function heroBalance(page: Page) {
  return page.getByTestId('account-balance').locator('.kpi__value');
}

/** The whole ledger, unfiltered — its sum must be the displayed balance. */
async function ledgerSum(api: Api): Promise<number> {
  const page = await api.get<{ content: Movement[] }>('/api/account/movements?size=500');
  return page.content.reduce((sum, m) => sum + m.amount, 0);
}

async function adjustments(api: Api): Promise<Movement[]> {
  const page = await api.get<{ content: Movement[] }>('/api/account/movements?size=500');
  return page.content.filter((m) => m.type === 'ADJUSTMENT');
}

async function deposit(api: Api, amount: number, valueDate: string, note?: string): Promise<void> {
  await api.post('/api/account/movements', { type: 'DEPOSIT', amount, valueDate, note });
}

async function seedStat(api: Api, ticker: string, tradeDate: string): Promise<void> {
  await api.post('/api/stats', {
    tradeDate,
    ticker,
    previousClose: 2.65,
    pmOpen: 3.2,
    pmHigh: 3.6,
  });
}

/** [n] days before today, on the New York calendar `isoToday` follows. */
function daysAgo(n: number): string {
  const [year, month, day] = isoToday().split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - n)).toISOString().slice(0, 10);
}

/** Day [day] of last month — always inside the « Mois dernier » preset, always before today. */
function lastMonthOn(day: number): string {
  const [year, month] = isoToday().split('-').map(Number);
  return new Date(Date.UTC(year, month - 2, day)).toISOString().slice(0, 10);
}

function frDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}
