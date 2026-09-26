import { Locator, Page } from '@playwright/test';
import { Api, expect, isoToday, test, typeNumber } from '../fixtures';

/**
 * The session panel of the stats sheet (#367, scenario 3) — the screen with the most invisible
 * state : every field saves on its own when left, and a validation can hold a save the user
 * cannot see leaving. What is pinned :
 *
 * - leaving a field saves that field alone, and the card says when ;
 * - a HOD below the push flags the save, puts the ✓ out of reach, and **sends nothing** (#305) ;
 * - a required premarket price cleared holds the session card too, until the premarket is fixed
 *   (#348) ;
 * - the pattern saves as soon as it is picked (#393) ;
 * - « Fermer », « Nouvelle stat » and opening another stat ask before dropping a held edit ;
 * - a filter that takes the stat off the table closes the panel **without** asking, drops the edit,
 *   says so, and sends nothing (#383).
 *
 * Each test seeds its stats through the API and opens the panel from `/stats?stat=<id>`.
 */

interface Stat {
  id: string;
  pattern: string;
  openPrice: number | null;
  pushOpenPrice: number | null;
  hodPrice: number | null;
  lodPrice: number | null;
}

const TICKER = 'KTTA';

async function seedStat(api: Api, ticker = TICKER): Promise<Stat> {
  return api.post<Stat>('/api/stats', {
    tradeDate: isoToday(),
    ticker,
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
    openPrice: 4.2,
  });
}

async function openPanel(page: Page, stat: Stat): Promise<void> {
  await page.goto(`/stats?stat=${stat.id}`);
  await expect(premarket(page).getByText(TICKER, { exact: true })).toBeVisible();
}

/** Every write of the panel is a `PUT /api/stats/<id>` : counted to prove nothing left. */
function countSaves(page: Page, stat: Stat): () => number {
  let saves = 0;
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().endsWith(`/api/stats/${stat.id}`)) saves++;
  });
  return () => saves;
}

test('leaving a field saves that field alone, and the card says when', async ({ api, page }) => {
  const stat = await seedStat(api);
  await openPanel(page, stat);

  await typeNumber(session(page).getByLabel('HOD', { exact: true }), '4.80');

  await expect(session(page).getByText(/✓ enregistré à \d\d:\d\d/)).toBeVisible();
  const saved = await api.get<Stat>(`/api/stats/${stat.id}`);
  expect(saved.hodPrice).toBe(4.8);
  expect(saved.lodPrice).toBeNull();
  expect(saved.pushOpenPrice).toBeNull();
});

test('a HOD below the push holds the save, blocks the tick and sends nothing', async ({
  api,
  page,
}) => {
  const stat = await seedStat(api);
  await openPanel(page, stat);
  await typeNumber(session(page).getByLabel('Push open', { exact: true }), '4.60');
  await expect(session(page).getByText(/✓ enregistré à/)).toBeVisible();
  const saves = countSaves(page, stat);

  await typeNumber(session(page).getByLabel('HOD', { exact: true }), '4.50');

  await expect(
    session(page).getByText('non enregistré — un prix passe au-dessus du HOD'),
  ).toBeVisible();
  await expect(session(page).getByRole('button', { name: 'Marquer complétée' })).toBeDisabled();
  expect(saves()).toBe(0);
  expect((await api.get<Stat>(`/api/stats/${stat.id}`)).hodPrice).toBeNull();
});

test('a cleared premarket price holds the session card until the premarket is fixed', async ({
  api,
  page,
}) => {
  const stat = await seedStat(api);
  await openPanel(page, stat);

  await clear(premarket(page).getByLabel('Clôture veille'));
  await expect(
    premarket(page).getByText('non enregistré — les trois prix premarket sont requis'),
  ).toBeVisible();
  const saves = countSaves(page, stat);
  await typeNumber(session(page).getByLabel('HOD', { exact: true }), '4.80');
  await expect(session(page).getByText('en attente du premarket')).toBeVisible();
  expect(saves()).toBe(0);

  await typeNumber(premarket(page).getByLabel('Clôture veille'), '2.65');

  await expect.poll(async () => (await api.get<Stat>(`/api/stats/${stat.id}`)).hodPrice).toBe(4.8);
});

test('the pattern saves as soon as it is picked', async ({ api, page }) => {
  const stat = await seedStat(api);
  await openPanel(page, stat);

  await premarket(page).getByLabel('Pattern').click();
  // SIR, measured like a GUS : re-filing to or from DT is refused, a double top is a stat of its own.
  await page.getByRole('option', { name: 'SIR — Short Into Resistance' }).click();

  await expect.poll(async () => (await api.get<Stat>(`/api/stats/${stat.id}`)).pattern).toBe('SIR');
  const row = page.getByRole('row').filter({ hasText: TICKER });
  await expect(row.getByRole('cell', { name: 'SIR', exact: true })).toBeVisible();
});

test('closing, a new stat or another stat ask before dropping a held edit', async ({
  api,
  page,
}) => {
  const stat = await seedStat(api);
  await seedStat(api, 'BNRG');
  await openPanel(page, stat);
  await holdAnEdit(page);

  const leaving: [string, Locator][] = [
    ['Fermer', session(page).getByRole('button', { name: 'Fermer' })],
    ['Nouvelle stat', page.getByRole('button', { name: 'Nouvelle stat' })],
    [
      'another stat',
      page.getByRole('row').filter({ hasText: 'BNRG' }).getByRole('button', { name: 'Séance' }),
    ],
  ];
  for (const [label, action] of leaving) {
    await action.click();
    const dialog = page.getByRole('dialog', { name: 'Quitter sans enregistrer ?' });
    await expect(dialog, label).toBeVisible();
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(premarket(page).getByText(TICKER, { exact: true }), label).toBeVisible();
  }

  await session(page).getByRole('button', { name: 'Fermer' }).click();
  await page
    .getByRole('dialog', { name: 'Quitter sans enregistrer ?' })
    .getByRole('button', { name: 'Quitter sans enregistrer' })
    .click();
  await expect(page.locator('.complete-card')).toHaveCount(0);
  expect((await api.get<Stat>(`/api/stats/${stat.id}`)).hodPrice).toBeNull();
});

test('a filter that takes the stat off the table drops the held edit without asking', async ({
  api,
  page,
}) => {
  const stat = await seedStat(api);
  await openPanel(page, stat);
  await holdAnEdit(page);
  const saves = countSaves(page, stat);

  // The stat is still to complete : the « Complétées » tab leaves it out.
  await page.getByRole('radio', { name: 'Complétées' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByText(`${TICKER} : la modification non enregistrée est abandonnée.`),
  ).toBeVisible();
  await expect(page.locator('.complete-card')).toHaveCount(0);
  expect(saves()).toBe(0);
  expect((await api.get<Stat>(`/api/stats/${stat.id}`)).hodPrice).toBeNull();
});

function premarket(page: Page): Locator {
  return page.locator('.premarket-card');
}

function session(page: Page): Locator {
  return page.locator('.complete-card');
}

/** A HOD under the LOD : the session card holds it, the panel now has an edit it cannot send. */
async function holdAnEdit(page: Page): Promise<void> {
  await typeNumber(session(page).getByLabel('LOD', { exact: true }), '3.40');
  await expect(session(page).getByText(/✓ enregistré à/)).toBeVisible();
  await typeNumber(session(page).getByLabel('HOD', { exact: true }), '3.20');
  await expect(session(page).getByText(/non enregistré/)).toBeVisible();
}

async function clear(field: Locator): Promise<void> {
  await field.focus();
  await field.press('ControlOrMeta+a');
  await field.press('Delete');
  await field.blur();
}
