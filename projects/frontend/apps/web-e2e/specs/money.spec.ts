import { Page } from '@playwright/test';
import { Api, expect, isoToday, parseFrAmount, test, typeNumber } from '../fixtures';

/**
 * Money is never silently wrong (#367, scenario 4) — the morning reconciliation is the one place
 * where a figure typed by hand moves the balance. Throughout, the assertion that matters : **the
 * movements sum to the balance on screen**.
 *
 * - a clean morning — typed, or « Aucun écart » in one click (#407) — writes a reconciliation and
 *   nothing else : no dialog, no correction, the balance untouched ;
 * - a negative broker balance is refused on the field and never reaches the API (#307) ;
 * - a gap creates a « Correction » line and the balance lands on the broker's figure ;
 * - a gap past a fifth of the balance asks first, as a warning (#307), and declining writes nothing ;
 * - cancelling a morning removes it with its correction, and the balance returns where it was.
 *
 * Each test starts from a fresh account funded with one 10 000 $ deposit.
 *
 * Button names are matched as **substrings** (Playwright's default) : a Material button's accessible
 * name carries its icon ligature — « tune\nCréer la correction ». `exact: true` would break them ;
 * it is only right on plain text, like the ledger's « Correction » cell.
 */

interface Summary {
  balance: number;
}
interface Movement {
  type: string;
  amount: number;
}
interface Reconciliation {
  id: string;
}

const DEPOSIT = 10000;

test.beforeEach(async ({ api, page }) => {
  await api.post('/api/account/movements', {
    type: 'DEPOSIT',
    amount: DEPOSIT,
    valueDate: isoToday(),
    note: 'Dépôt initial',
  });
  await page.goto('/account');
  await expect(heroBalance(page)).toContainText('10');
});

test('a clean morning is timestamped without a dialog, and writes no correction', async ({
  api,
  page,
}) => {
  await typeBrokerBalance(page, '10000');
  await page.getByRole('button', { name: 'Valider le rapprochement' }).click();

  await expect(page.getByText('Rapproché ce matin — aucun écart.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectCleanMorning(api, page);
});

test('« Aucun écart » reconciles at the computed balance in one click', async ({ api, page }) => {
  await page.getByRole('button', { name: 'Aucun écart' }).click();

  await expect(page.getByText('Rapproché ce matin — aucun écart.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectCleanMorning(api, page);
});

test('a negative broker balance is refused on the field and never sent', async ({ api, page }) => {
  await typeBrokerBalance(page, '-500');

  await expect(page.getByText('Un solde négatif est impossible')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer la correction' })).toBeDisabled();
  expect(await api.get<Reconciliation[]>('/api/account/reconciliations')).toHaveLength(0);
});

// #416 : typed faster than change detection, « 9987,60 » read « 998760 » — and the reconciliation
// offered a 988 760 $ correction. Checked before anything is sent, on the field itself.
test('a balance typed at full speed reads back as typed', async ({ page }) => {
  const field = page.getByLabel('Solde TradeZero');
  await field.focus();
  await field.pressSequentially('9987,60');

  await expect(field).toHaveValue('9987,60');
  await field.blur();
  await expect(field).toHaveValue(`9${'\u202f'}987,60`);
});

test('a gap creates a correction, and the ledger sums to the balance on screen', async ({
  api,
  page,
}) => {
  await typeBrokerBalance(page, '10012,40');
  await page.getByRole('button', { name: 'Créer la correction' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Créer la correction' }).click();

  await expect(page.getByText('une correction de 12,40')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Correction', exact: true })).toBeVisible();
  await expect.poll(async () => parseFrAmount(await heroBalance(page).innerText())).toBe(10012.4);
  expect(await ledgerSum(api)).toBeCloseTo(10012.4, 2);
});

test('a gap past a fifth of the balance warns, and declining writes nothing', async ({
  api,
  page,
}) => {
  await typeBrokerBalance(page, '13000');
  await page.getByRole('button', { name: 'Créer la correction' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Écart inhabituel');
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toBeHidden();

  expect(await api.get<Reconciliation[]>('/api/account/reconciliations')).toHaveLength(0);
  expect((await api.get<Summary>('/api/account/summary')).balance).toBe(DEPOSIT);
  expect(await ledgerSum(api)).toBe(DEPOSIT);
});

test('cancelling a morning removes it with its correction, and the balance returns', async ({
  api,
  page,
}) => {
  await typeBrokerBalance(page, '9987,60');
  await page.getByRole('button', { name: 'Créer la correction' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Créer la correction' }).click();
  await expect(page.getByText('une correction de -12,40')).toBeVisible();

  await page.getByRole('button', { name: 'Annuler ce rapprochement' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler le rapprochement' }).click();

  await expect(page.getByRole('cell', { name: 'Correction', exact: true })).toBeHidden();
  await expect.poll(async () => parseFrAmount(await heroBalance(page).innerText())).toBe(DEPOSIT);
  expect(await api.get<Reconciliation[]>('/api/account/reconciliations')).toHaveLength(0);
  expect(await ledgerSum(api)).toBe(DEPOSIT);
});

/** One reconciliation, no correction, the deposit alone on the ledger and on screen. */
async function expectCleanMorning(api: Api, page: Page): Promise<void> {
  expect(await api.get<Reconciliation[]>('/api/account/reconciliations')).toHaveLength(1);
  await expect(page.getByRole('cell', { name: 'Correction', exact: true })).toHaveCount(0);
  expect(parseFrAmount(await heroBalance(page).innerText())).toBe(DEPOSIT);
  expect(await ledgerSum(api)).toBe(DEPOSIT);
}

function heroBalance(page: Page) {
  return page.locator('.kpi--hero .kpi__value');
}

async function typeBrokerBalance(page: Page, value: string): Promise<void> {
  await typeNumber(page.getByLabel('Solde TradeZero'), value);
}

/** The whole ledger, unfiltered — its sum must be the displayed balance. */
async function ledgerSum(api: Api): Promise<number> {
  const page = await api.get<{ content: Movement[] }>('/api/account/movements?size=500');
  return page.content.reduce((sum, m) => sum + m.amount, 0);
}
