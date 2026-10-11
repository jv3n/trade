import { Locator, Page } from '@playwright/test';
import { Api, expect, isoToday, parseFrAmount, test } from '../fixtures';

/**
 * The « Flux du compte » report (#685, #702) — the longest chain the app has : a Postgres aggregate
 * (`date_trunc`, `generate_series`, `FILTER`), a bar clipped to the period, a wire DTO, a resource
 * keyed on the question, the bar size kept by hand, chips kept in `localStorage`, and a chart that
 * stacks positives above zero and negatives below. Every link has a unit test ; this suite proves
 * the chain adds up.
 *
 * 1. the seeded ledger adds up on screen ;
 * 2. a week starts on Monday, in New York ;
 * 3. the first bar is labelled by the period's start, not by its bucket's ;
 * 4. the bar size follows the period, a hand-picked one is kept, a too-wide one is refused ;
 * 5. « Jour » over all time is refused past the 400-bar guard ;
 * 6. the chips move the KPI row, the breakdown and the bars together — not the balance — and
 *    survive a reload ;
 * 7. a period without movement shows the empty state ;
 * 8. the tooltip names only the series that moved, plus the net.
 *
 * The `api` fixture **may** arrange the ledger here (deposits, withdrawals, closed trades, locates) :
 * a movement is born of its own context's event whichever door it comes through, and the seam
 * under test starts at the aggregate, not at the write. Acts (period, bar size, chips) and reads
 * (KPI row, breakdown, bars, tooltip) go through the page only. The chart is a canvas : its bars
 * are read from the visually hidden table `StbBarChart` carries for screen readers.
 */

interface Trade {
  id: string;
}

test('the seeded ledger adds up on screen', async ({ api, page }) => {
  const day = daysAgo(10);
  await deposit(api, 1000, day);
  await withdraw(api, 300, day);
  await closedTrade(api, 'WINA', day, 200);
  await closedTrade(api, 'WINB', day, 120);
  await closedTrade(api, 'LOSS', day, -150);
  await locate(api, 'LOSS', day, 40);

  await openReport(page);

  // Net = everything ; trading = trades + locates ; injected = deposits − withdrawals.
  expect(await amount(netTile(page))).toBe(830);
  expect(await amount(page.getByTestId('kpi-trading'))).toBe(130);
  expect(await amount(page.getByTestId('kpi-injected'))).toBe(700);
  expect(await amount(page.getByTestId('kpi-balance'))).toBe(830);

  // The top-level lines share the gross flows ; the winners and losers are a split of « Trades ».
  const shares = await topLevelShares(page);
  const total = shares.reduce((sum, s) => sum + s, 0);
  expect(total).toBeGreaterThanOrEqual(99);
  expect(total).toBeLessThanOrEqual(101);

  // Everything was dated the same day : one bar carries it, every other one is empty.
  const rows = await bars(page);
  expect(rows.filter((r) => r.moved).length).toBe(1);
});

test('a week starts on Monday, in New York', async ({ api, page }) => {
  const { sunday, monday } = lastSundayAndMonday();
  await deposit(api, 100, sunday);
  await deposit(api, 200, monday);

  await openReport(page);
  await expect(bucketToggle(page, 'WEEK')).toHaveClass(/mat-button-toggle-checked/);

  const withDeposits = (await bars(page)).filter((r) => r.moved);
  expect(withDeposits.length).toBe(2);
  expect(withDeposits[0].title).toContain(`au ${frDay(sunday)}`);
  expect(withDeposits[1].title).toContain(`du ${frDay(monday)}`);
});

test("the first bar is labelled by the period's start, not by its bucket's", async ({
  api,
  page,
}) => {
  const start = threeMonthsAgo();
  await deposit(api, 100, start);

  await openReport(page);

  // « 3 derniers mois » opens by week : the first week is cut by the period, and reads from its
  // first day — a Monday only when the period happens to start on one.
  const [first] = await bars(page);
  expect(first.title).toContain(`du ${frDay(start)}`);
  expect(first.moved).toBe(true);
});

// No seed, but the `api` fixture all the same : it is what opens the session — without it the
// page sends the visitor to the sign-in.
test('the bar size follows the period, keeps a hand-picked one, and refuses a too-wide one', async ({
  api: _session,
  page,
}) => {
  await openReport(page);

  await pickPeriod(page, 'Ce mois');
  await expect(bucketButton(page, 'DAY')).toBeEnabled();
  await expect(bucketButton(page, 'YEAR')).toBeDisabled();

  await pickPeriod(page, 'Année dernière');
  await expect(bucketButton(page, 'YEAR')).toBeEnabled();

  // « Mois » picked on a year, then a single day : the day shows by day, the year gets its month
  // back.
  await bucketButton(page, 'MONTH').click();
  await pickPeriod(page, "Aujourd'hui");
  await expect(bucketButton(page, 'MONTH')).toBeDisabled();
  await expect(bucketToggle(page, 'DAY')).toHaveClass(/mat-button-toggle-checked/);
  await pickPeriod(page, 'Année dernière');
  await expect(bucketToggle(page, 'MONTH')).toHaveClass(/mat-button-toggle-checked/);
});

test('« Jour » over all time is refused past the 400-bar guard', async ({ api, page }) => {
  // Seeded explicitly : a history the guard reaches whatever the calendar says.
  await deposit(api, 100, daysAgo(401));
  await deposit(api, 100, isoToday());

  await openReport(page);
  await pickPeriod(page, 'Toutes périodes');

  await expect(bucketButton(page, 'MONTH')).toBeEnabled();
  await expect(bucketButton(page, 'DAY')).toBeDisabled();
});

test('the chips move the KPI row, the breakdown and the bars together, and survive a reload', async ({
  api,
  page,
}) => {
  const day = daysAgo(10);
  await deposit(api, 1000, day);
  await closedTrade(api, 'CHIP', day, 200);
  await locate(api, 'CHIP', day, 40);

  await openReport(page);
  expect(await amount(netTile(page))).toBe(1160);
  expect(await amount(page.getByTestId('kpi-balance'))).toBe(1160);

  await typeButton(page, 'DEPOSIT').click();

  await expect.poll(async () => amount(netTile(page))).toBe(160);
  await expect(breakdownRow(page, 'Dépôts')).toHaveCount(0);
  const shares = await topLevelShares(page);
  expect(shares.reduce((sum, s) => sum + s, 0)).toBeGreaterThanOrEqual(99);
  expect(await chartColumns(page)).not.toContain('Dépôts');
  // The balance is the account's, not a filtered aggregate.
  expect(await amount(page.getByTestId('kpi-balance'))).toBe(1160);

  await page.reload();
  await expect(typeToggle(page, 'DEPOSIT')).not.toHaveClass(/mat-button-toggle-checked/);
  expect(await page.evaluate(() => localStorage.getItem('reports.cashFlow.types'))).not.toContain(
    'DEPOSIT',
  );
});

test('a period without movement shows the empty state', async ({ api, page }) => {
  // Not an empty account — a different state — just nothing in the period.
  await deposit(api, 100, daysAgo(200));

  await openReport(page);
  await pickPeriod(page, 'Mois dernier');

  await expect(page.getByTestId('reports-empty')).toBeVisible();
  await expect(page.getByTestId('reports-kpis')).toHaveCount(0);
  await expect(page.locator('ui-bar-chart')).toHaveCount(0);
});

test('the tooltip names only the series that moved, plus the net', async ({ api, page }) => {
  await deposit(api, 500, isoToday());

  await openReport(page);
  await pickPeriod(page, "Aujourd'hui");

  await expect(page.getByTestId('bar-chart-data').locator('tbody tr')).toHaveCount(1);
  const canvas = page.locator('ui-bar-chart canvas').first();
  const chart = page.locator('ui-bar-chart ui-chart');

  // The chart draws a beat after its data lands : a hover before that finds no bar. Hover again
  // until the tooltip answers.
  await expect(async () => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error('the chart has no box');
    await page.mouse.move(box.x + 4, box.y + 4);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
    await expect(chart).toContainText('Dépôts', { timeout: 1000 });
  }).toPass();
  await expect(chart).toContainText('Net');
  await expect(chart).not.toContainText('Trades gagnants');
});

// --------------------------------------------------------------------------- arranging

async function deposit(api: Api, amount: number, valueDate: string): Promise<void> {
  await api.post('/api/account/movements', { type: 'DEPOSIT', amount, valueDate, note: null });
}

async function withdraw(api: Api, amount: number, valueDate: string): Promise<void> {
  await api.post('/api/account/movements', { type: 'WITHDRAWAL', amount, valueDate, note: null });
}

/** A short of 1 000 shares at 5.00, covered for [pnl] — its P&L reaches the account. */
async function closedTrade(
  api: Api,
  ticker: string,
  tradeDate: string,
  pnl: number,
): Promise<void> {
  const stat = await api.post<{ id: string }>('/api/stats', {
    tradeDate,
    ticker,
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
  });
  const trade = await api.post<Trade>(`/api/stats/${stat.id}/trade`);
  await api.put(`/api/journal/trades/${trade.id}`, {
    tradeDate,
    ticker,
    direction: 'SHORT',
    executions: [
      { kind: 'ENTRY', shares: 1000, price: 5 },
      { kind: 'EXIT', shares: 1000, price: 5 - pnl / 1000 },
    ],
  });
}

/** 1 000 shares at [cost] / 1 000 a share. */
async function locate(api: Api, ticker: string, tradingDate: string, cost: number): Promise<void> {
  await api.post('/api/locates', {
    tradingDate,
    ticker,
    shares: 1000,
    pricePerShare: cost / 1000,
    stockPrice: 5,
    note: null,
  });
}

// --------------------------------------------------------------------------- dates (New York)

function day(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = day(isoToday());
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
}

/** A Sunday a week or more back, and the Monday after it — both in the past. */
function lastSundayAndMonday(): { sunday: string; monday: string } {
  const today = day(isoToday());
  const sunday = new Date(today);
  sunday.setUTCDate(today.getUTCDate() - today.getUTCDay() - 7);
  const monday = new Date(sunday);
  monday.setUTCDate(sunday.getUTCDate() + 1);
  return { sunday: iso(sunday), monday: iso(monday) };
}

/** The first day of « 3 derniers mois » : the same day three months back, clamped to month's end. */
function threeMonthsAgo(): string {
  const today = day(isoToday());
  const target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 3, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(today.getUTCDate(), lastDay));
  return iso(target);
}

/** `2026-09-14` → `14/09`, as the bars' titles read in French. */
function frDay(isoDate: string): string {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

// --------------------------------------------------------------------------- the page

async function openReport(page: Page): Promise<void> {
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Rapports' })).toBeVisible();
  await expect(
    page.getByTestId('reports-kpis').or(page.getByTestId('reports-empty')),
  ).toBeVisible();
}

async function pickPeriod(page: Page, preset: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Période' }).click();
  await page.getByRole('option', { name: preset, exact: true }).click();
}

function netTile(page: Page): Locator {
  return page.getByTestId('reports-kpis').locator('.kpi').first();
}

async function amount(tile: Locator): Promise<number> {
  return parseFrAmount(await tile.locator('.kpi__value').innerText());
}

function bucketToggle(page: Page, size: string): Locator {
  return page.getByTestId(`bucket-${size}`);
}

function bucketButton(page: Page, size: string): Locator {
  return bucketToggle(page, size).locator('button');
}

function typeToggle(page: Page, type: string): Locator {
  return page.getByTestId(`type-${type}`);
}

function typeButton(page: Page, type: string): Locator {
  return typeToggle(page, type).locator('button');
}

function breakdownRow(page: Page, label: string): Locator {
  return page.getByTestId('breakdown').locator('tbody tr').filter({ hasText: label });
}

/** The shares of the breakdown's top-level lines — not the winners / losers split, not the net. */
async function topLevelShares(page: Page): Promise<number[]> {
  const rows = page.getByTestId('breakdown').locator('tbody tr:not(.indent):not(.total)');
  const cells = await rows.locator('td:last-child').allInnerTexts();
  return cells.map((text) => Number(text.replace(/[^\d]/g, '')));
}

/** The bars, from the table the chart carries for screen readers : a title, and whether it moved. */
async function bars(page: Page): Promise<{ title: string; moved: boolean }[]> {
  const table = page.getByTestId('bar-chart-data');
  await expect(table).toBeAttached();
  return table.locator('tbody tr').evaluateAll((rows) =>
    rows.map((row) => {
      const cells = [...row.children].map((c) => c.textContent?.trim() ?? '');
      // The title, the series' cells (empty where nothing moved), then the net.
      return { title: cells[0], moved: cells.slice(1, -1).some((c) => c !== '') };
    }),
  );
}

async function chartColumns(page: Page): Promise<string[]> {
  return page.getByTestId('bar-chart-data').locator('thead th').allInnerTexts();
}
