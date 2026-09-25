import { Locator, Page } from '@playwright/test';
import { Api, expect, isoToday, test, typeNumber } from '../fixtures';

/**
 * One locale drives everything (#367, scenario 5) — the family behind most regressions (#311,
 * #335, #355, #356, #363). The interface language, set in the preferences, decides :
 *
 * - the separators and the date format, in the tables **and** in the inputs ;
 * - a value typed into a masked field and left reads back **unchanged** — the round-trip is where
 *   the bugs live ;
 * - counts agree with their number, and **the two locales disagree about zero** : « 0 candidat »
 *   is singular in French, « 0 candidates » plural in English (#382) ;
 * - every amount carries its currency, and the currency follows the locale : `$ US` / `USD`, and
 *   the CAD toggle `$ CA` / `CAD` (#384, #395) ;
 * - the spaces are asserted **on codepoints**, not on appearance : the French group separator is
 *   U+202F and the currency's two spaces are U+00A0 — never U+0020 (#389). A screenshot cannot
 *   tell them apart.
 *
 * And the machine's own regional settings change nothing : the browser runs in German below.
 */

const NNBSP = ' ';
const NBSP = ' ';

/** 12 345,60 $ — thousands, decimals and a currency in one figure. */
const DEPOSIT = 12345.6;
/** Mocked : the real rate comes from an external provider, and the figure must be exact. */
const USD_CAD = 1.25;

test.use({ locale: 'de-DE' });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/forex/rate**', (route) =>
    route.fulfill({ json: { base: 'USD', quote: 'CAD', rate: USD_CAD, asOf: isoToday() } }),
  );
});

test('counts agree with their number, and French and English disagree about zero', async ({
  api,
  page,
}) => {
  await page.goto('/candidates');
  await expect(page.getByText('0 candidat · trié par gap', { exact: true })).toBeVisible();

  await switchToEnglish(page);
  await page.goto('/candidates');
  await expect(page.getByText('0 candidates · sorted by gap', { exact: true })).toBeVisible();

  await seedCandidate(api);
  await page.reload();
  await expect(page.getByText('1 candidate · sorted by gap', { exact: true })).toBeVisible();

  await setLanguage(api, 'fr');
  await page.reload();
  await expect(page.getByText('1 candidat · trié par gap', { exact: true })).toBeVisible();
});

test('amounts carry their currency and its spaces, down to the codepoint', async ({
  api,
  page,
}) => {
  await deposit(api);
  await page.goto('/account');

  await expectExactText(heroBalance(page), `12${NNBSP}345,60${NBSP}$${NBSP}US`);
  await page.getByRole('radio', { name: 'CAD' }).click();
  await expectExactText(heroBalance(page), `15${NNBSP}432,00${NBSP}$${NBSP}CA`);

  await setLanguage(api, 'en');
  await page.reload();
  await page.getByRole('radio', { name: 'USD' }).click();
  await expectExactText(heroBalance(page), `12,345.60${NBSP}USD`);
  await page.getByRole('radio', { name: 'CAD' }).click();
  await expectExactText(heroBalance(page), `15,432.00${NBSP}CAD`);
});

test('tables and inputs follow the language, and a typed value reads back unchanged', async ({
  api,
  page,
}) => {
  await deposit(api);
  const [year, month, day] = isoToday().split('-');

  // French : day first, comma decimals, narrow no-break space between the thousands.
  await page.goto('/account');
  await expect(page.getByRole('cell', { name: `${day}/${month}/${year}` })).toBeVisible();
  await expect(page.getByRole('cell', { name: `+12${NNBSP}345,60` })).toBeVisible();
  await page.goto('/candidates');
  await expect(page.getByLabel('Jour', { exact: true })).toHaveValue(`${day}/${month}/${year}`);
  await expectRoundTrip(page, 'Clôture veille ($)', '1234,5', `1${NNBSP}234,5000`);

  // English : month first, dot decimals, comma between the thousands.
  await setLanguage(api, 'en');
  await page.goto('/account');
  await expect(
    page.getByRole('cell', { name: `${Number(month)}/${Number(day)}/${year.slice(2)}` }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: '+12,345.60' })).toBeVisible();
  await page.goto('/candidates');
  await expect(page.getByLabel('Day', { exact: true })).toHaveValue(
    `${Number(month)}/${Number(day)}/${year}`,
  );
  await expectRoundTrip(page, 'Previous close ($)', '1234.5', '1,234.5000');
});

/**
 * Types [typed], leaves the field, and expects [shown] — then enters and leaves it again without
 * typing : a value that drifts on that second pass is a separator read the wrong way.
 */
async function expectRoundTrip(
  page: Page,
  label: string,
  typed: string,
  shown: string,
): Promise<void> {
  const field = page.getByLabel(label);
  await typeNumber(field, typed);
  await expect(field).toHaveValue(shown);
  await field.focus();
  await field.blur();
  await expect(field).toHaveValue(shown);
}

/** Through the preferences page, the way the user does it — the page reloads on the switch. */
async function switchToEnglish(page: Page): Promise<void> {
  await page.goto('/settings/preferences');
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();
}

async function setLanguage(api: Api, language: 'fr' | 'en'): Promise<void> {
  await api.put('/api/me/preferences', { language });
}

async function deposit(api: Api): Promise<void> {
  await api.post('/api/account/movements', {
    type: 'DEPOSIT',
    amount: DEPOSIT,
    valueDate: isoToday(),
  });
}

async function seedCandidate(api: Api): Promise<void> {
  await api.post('/api/candidates', {
    tradingDate: isoToday(),
    ticker: 'KTTA',
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
  });
}

/**
 * The node's text **codepoint for codepoint**, template padding aside. `toHaveText` would not do :
 * it normalises whitespace, and JavaScript counts U+00A0 and U+202F as whitespace.
 */
async function expectExactText(locator: Locator, text: string): Promise<void> {
  await expect
    .poll(async () => (await locator.textContent())?.replace(/^[ \n]+|[ \n]+$/g, ''))
    .toBe(text);
}

function heroBalance(page: Page) {
  return page.locator('.kpi--hero .kpi__value');
}
