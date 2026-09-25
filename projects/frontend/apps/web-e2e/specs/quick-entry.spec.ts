import { Locator, Page } from '@playwright/test';
import { expect, isoToday, test } from '../fixtures';

/**
 * Quick entry : three candidates in a row (#367, scenario 2) — the screen used under time pressure
 * in premarket, keyboard only. Tab from field to field, Enter to save, and again :
 *
 * - the form is **completely empty** after each save — nothing survives into the next candidate
 *   (#315) — and the cursor is back on the ticker ;
 * - the pattern is kept between captures ;
 * - the gap and push previews are the figures the row then displays ;
 * - re-typing a ticker already captured that day flags it while typing and blocks the save.
 */

interface Capture {
  ticker: string;
  /** Previous close, PM open, PM high, float, volume, locate — in the form's tab order. */
  figures: [string, string, string, string, string, string];
  note: string;
}

const CAPTURES: Capture[] = [
  {
    ticker: 'KTTA',
    figures: ['2.65', '4.05', '4.65', '8.2', '3.1', '0.03'],
    note: 'Résistance 4,65 — high PM, pas de news',
  },
  { ticker: 'BNRG', figures: ['1.20', '1.80', '2.10', '12', '5.4', ''], note: '' },
  { ticker: 'MLGO', figures: ['3.10', '4.00', '4.40', '', '', ''], note: 'Offering possible' },
];

/** The capture form's fields, in tab order after the ticker. */
const NUMBER_FIELDS = [
  'Clôture veille ($)',
  'Open PM 4h00 ($)',
  'High PM ($)',
  'Float',
  'Volume',
  'Locate ($ / action)',
];

test('three candidates in a row, keyboard only, and a duplicate refused', async ({ api, page }) => {
  await page.goto('/candidates');

  // DT for the whole morning : picked once, kept across the three captures.
  await page.getByRole('combobox', { name: 'Pattern' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('option', { name: 'DT — Double Top' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Pattern' })).toContainText('DT');

  await page.getByLabel('Ticker').focus();
  for (const capture of CAPTURES) {
    await expect(page.getByLabel('Ticker')).toBeFocused();
    await typeCapture(page, capture);
    const preview = { gap: await derived(page, 'Gap'), push: await derived(page, 'Push') };
    await page.keyboard.press('Enter');
    await expect(page.getByText(`${capture.ticker} ajouté.`)).toBeVisible();

    await expectEmptyForm(page);
    await expect(page.getByRole('combobox', { name: 'Pattern' })).toContainText('DT');
    const row = dayTable(page).getByRole('row').filter({ hasText: capture.ticker });
    await expect(row.locator('.mat-column-gap')).toHaveText(preview.gap);
    await expect(row.locator('.mat-column-push')).toHaveText(preview.push);
  }

  // The fourth ticker is the first one again : flagged while typing, never sent.
  await page.keyboard.type(CAPTURES[0].ticker);
  await expect(page.getByText('Déjà saisi ce jour-là')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
  await page.keyboard.press('Enter');

  const day = await api.get<{ ticker: string; pattern: string }[]>(
    `/api/candidates?date=${isoToday()}`,
  );
  expect(day.map((c) => c.ticker).sort()).toEqual(['BNRG', 'KTTA', 'MLGO']);
  expect(day.every((c) => c.pattern === 'DT')).toBe(true);
});

/** Ticker, then Tab through the figures and the note, at machine speed. */
async function typeCapture(page: Page, capture: Capture): Promise<void> {
  await page.keyboard.type(capture.ticker);
  for (const value of capture.figures) {
    await page.keyboard.press('Tab');
    if (value) await page.keyboard.type(value);
  }
  await page.keyboard.press('Tab');
  if (capture.note) await page.keyboard.type(capture.note);
  // Enter on the note submits ; the previews are read first, while the form still holds the row.
  await expect(page.getByLabel('Note')).toBeFocused();
}

async function expectEmptyForm(page: Page): Promise<void> {
  await expect(page.getByLabel('Ticker')).toHaveValue('');
  for (const label of NUMBER_FIELDS) await expect(page.getByLabel(label)).toHaveValue('');
  await expect(page.getByLabel('Note')).toHaveValue('');
  await expect(derivedValue(page, 'Gap')).toHaveText('—');
}

/** The day's list — the « À l'open » card has its own table of the same tickers. */
function dayTable(page: Page): Locator {
  return page.locator('section.card').filter({ hasText: /triés? par gap/ });
}

function derivedValue(page: Page, label: string): Locator {
  return page
    .locator('.derived')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('.derived__value');
}

async function derived(page: Page, label: string): Promise<string> {
  const value = derivedValue(page, label);
  await expect(value).not.toHaveText('—');
  return (await value.textContent())!.trim();
}
