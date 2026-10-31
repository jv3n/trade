import { expect, isoToday, openedDialog, test } from '../fixtures';

/**
 * The review of the scanner's stats (#764, epic #760) — ts-scanner drops the previous session's GUS
 * and double tops as stats to review ; the owner validates the real ones and rejects the rest.
 * What is pinned, end to end :
 *
 * - « À relire » lands on « Tous » with the count of both patterns ;
 * - « Valider » takes NXTP into the stats, to complete, with no confirmation ;
 * - « Rejeter » asks, with a reason of the stat's pattern — BNRG, a double top the Echo broke — and
 *   a free note (#787) ;
 * - the rejected stat is gone from « Toutes », and back under « Rejetées » with its reason, its
 *   note on the tag and in the panel ;
 * - « Rétablir » sends it back to review, reason and note dropped.
 *
 * The stats come in through the e2e twin of the scanner's endpoint, for the test's own user.
 */

const NOTE = "L'Echo passe 12 % au-dessus de l'Apex, le volume repart.";

interface Stat {
  id: string;
  ticker: string;
  review: string | null;
  rejectionReason: string | null;
  rejectionNote: string | null;
}

test('a scanner stat is validated, another rejected, and the rejected one leaves « Toutes »', async ({
  api,
  page,
}) => {
  const day = new Date(`${isoToday()}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  await api.post('/api/e2e/scanner-stats', {
    tradingDate: day.toISOString().slice(0, 10),
    stats: [
      {
        pattern: 'GUS',
        ticker: 'NXTP',
        previousClose: 1.4,
        pmOpen: 2.1,
        pmHigh: 2.62,
        openPrice: 2.25,
        pushOpenPrice: 2.58,
        pushOpenTime: '09:36',
        hodPrice: 2.62,
        lodPrice: 1.71,
        eodPrice: 1.8,
      },
      {
        pattern: 'DT',
        ticker: 'BNRG',
        dtStartPrice: 2.1,
        dtStartTime: '10:05',
        dtTopPrice: 3.3,
        dtTopTime: '10:16',
        dtLowPrice: 2.68,
        dtLowTime: '10:24',
        dtRetestPrice: 3.21,
        dtRetestTime: '10:41',
      },
    ],
  });

  // ---- « À relire » : both patterns, on « Tous » ----
  await page.goto('/stats?status=TO_REVIEW');
  await expect(page.getByRole('radio', { name: 'À relire · 2' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Tous', exact: true })).toBeChecked();
  const nxtp = page.getByRole('row').filter({ hasText: 'NXTP' });
  const bnrg = page.getByRole('row').filter({ hasText: 'BNRG' });
  await expect(nxtp.getByText('scanner · à relire')).toBeVisible();
  await expect(bnrg.getByText('scanner · à relire')).toBeVisible();

  // ---- Valider : no confirmation, NXTP joins the stats to complete ----
  await nxtp.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByText('NXTP validée — à compléter.')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'À relire · 1' })).toBeVisible();

  // ---- Rejeter : confirmed, with a reason of the double top and a note ----
  await bnrg.getByRole('button', { name: 'Rejeter' }).click();
  const dialog = await openedDialog(page);
  await dialog.getByRole('combobox', { name: 'Motif (facultatif)' }).click();
  await expect(page.getByRole('option', { name: 'Gap trop faible' })).toHaveCount(0);
  await page.getByRole('option', { name: "Cassure — l'Echo a cassé au-dessus de l'Apex" }).click();
  await dialog.getByRole('textbox', { name: 'Note (facultatif)' }).fill(NOTE);
  await dialog.getByRole('button', { name: 'Rejeter' }).click();
  await expect(page.getByText('BNRG rejetée.')).toBeVisible();

  // ---- « Toutes » : NXTP with its neutral tag, BNRG gone ----
  await page.getByRole('radio', { name: 'Toutes', exact: true }).click();
  await expect(nxtp.getByText('scanner', { exact: true })).toBeVisible();
  await expect(bnrg).toHaveCount(0);

  // ---- « Rejetées » : BNRG back, greyed, with its reason and, on its tag, its note ----
  await page.getByRole('button', { name: 'Rejetées' }).click();
  const tag = bnrg.getByText('scanner · rejetée · cassure');
  await expect(tag).toBeVisible();
  await tag.hover();
  // The surface : Material also keeps the text in a hidden `role="tooltip"` node, for the a11y link.
  // Filtered : the « Rejetées » toggle, just clicked, may still show its own tooltip.
  await expect(
    page.locator('.mat-mdc-tooltip-surface').filter({ hasText: `Note : ${NOTE}` }),
  ).toBeVisible();

  const stats = await api.get<{ content: Stat[] }>('/api/stats?withRejected=true');
  const byTicker = Object.fromEntries(stats.content.map((s) => [s.ticker, s]));
  expect(byTicker['NXTP'].review).toBe('VALIDATED');
  expect(byTicker['BNRG']).toMatchObject({
    review: 'REJECTED',
    rejectionReason: 'BREAKOUT',
    rejectionNote: NOTE,
  });

  // ---- Its panel : the note in full, and « Rétablir » drops it with the reason ----
  await page.goto(`/stats?stat=${byTicker['BNRG'].id}`);
  await expect(page.locator('.review-note')).toHaveText(`Note : ${NOTE}`);
  await bnrg.getByRole('button', { name: 'Rétablir' }).click();
  await expect(page.getByRole('radio', { name: 'À relire · 1' })).toBeVisible();

  const restored = await api.get<Stat>(`/api/stats/${byTicker['BNRG'].id}`);
  expect(restored).toMatchObject({
    review: 'TO_REVIEW',
    rejectionReason: null,
    rejectionNote: null,
  });
});
