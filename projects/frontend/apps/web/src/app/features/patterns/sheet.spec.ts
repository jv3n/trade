import { describe, expect, it } from 'vitest';
import { parseSheet, sheetOf } from './sheet';

/**
 * Pins how a file of `docs/` becomes a panel (#419) : the collapsed header is read out of the file
 * itself — its title, its opening quote, its « Last revised » line — so the file stays the only
 * source. Those parts leave the body, so the open panel does not repeat them ; a file without a
 * revision line is one still to write. A link resolves against the folder of the file it sits in.
 */
describe('parseSheet', () => {
  const GUS = [
    '# Gap Up Short — pattern sheet',
    '',
    '> **Short** a US small-cap that gapped up in premarket with no fundamental behind it. The bet :',
    '> the price falls back during the session.',
    '',
    '*Last revised : 2026-09-25, from the Trading Desk session of 21 September.*',
    '',
    '---',
    '',
    '## Entry checklist',
    '',
    '| # | Criterion | Value |',
    '|---|-----------|-------|',
    '| 2 | **Gap up** | ≥ +45 % |',
    '',
    'Taken in a [double top](DT.md) or a [penny break](penny-break.md), judged with [the four',
    'sellers](../notes/four-sellers.md), never like the [old sheet](old.md).',
  ].join('\n');
  const gus = () => parseSheet({ shelf: 'pattern', file: 'GUS' }, GUS);

  it('reads the title without its « pattern sheet » suffix', () => {
    expect(gus().title).toBe('Gap Up Short');
  });

  it('reads the opening quote as the summary, across its lines', () => {
    expect(gus().summaryHtml).toContain('<strong>Short</strong> a US small-cap');
    expect(gus().summaryHtml).toContain('The bet : the price falls back');
  });

  // A click in the collapsed header opens the panel ; a link there would fight it.
  it('keeps only the text of a link in the summary', () => {
    const sheet = parseSheet(
      { shelf: 'notes', file: 'execution-signals' },
      '# Execution signals\n\n> Found inside a [GUS](../pattern/GUS.md).',
    );

    expect(sheet.summaryHtml).toBe('Found inside a GUS.');
  });

  it('reads the revision date as a local calendar day', () => {
    const { revisedOn } = gus();

    expect([revisedOn?.getFullYear(), revisedOn?.getMonth(), revisedOn?.getDate()]).toEqual([
      2026, 8, 25,
    ]);
  });

  it('leaves the header parts out of the body, and renders the rest', () => {
    const { bodyHtml } = gus();

    expect(bodyHtml).not.toContain('Gap Up Short');
    expect(bodyHtml).not.toContain('Last revised');
    expect(bodyHtml).not.toContain('<hr');
    expect(bodyHtml).toContain('<h2>Entry checklist</h2>');
    expect(bodyHtml).toContain('<table>');
    expect(bodyHtml).toContain('<strong>Gap up</strong>');
  });

  it('points a link to a sheet of the same folder at its panel', () => {
    expect(gus().bodyHtml).toContain('<a href="#sheet-pattern-DT">double top</a>');
    expect(gus().bodyHtml).toContain('<a href="#sheet-pattern-penny-break">penny break</a>');
  });

  it('points a link into the other folder at that panel', () => {
    expect(gus().bodyHtml).toContain('<a href="#sheet-notes-four-sellers">the four\nsellers</a>');
  });

  // A file the page does not show : a link there would lead nowhere.
  it('keeps only the text of a link to a file the page does not show', () => {
    expect(gus().bodyHtml).toContain('never like the old sheet.');
    expect(gus().bodyHtml).not.toContain('old.md');
  });

  it('resolves a note linking back to a sheet', () => {
    const note = parseSheet(
      { shelf: 'notes', file: 'four-sellers' },
      '# The four sellers\n\n> Who sells.\n\nWhy the [double top](../pattern/DT.md) asks for 17-20 %.',
    );

    expect(note.title).toBe('The four sellers');
    expect(note.bodyHtml).toContain('<a href="#sheet-pattern-DT">double top</a>');
  });

  it('reads the French twin of a sheet the same way, and follows its links', () => {
    const dt = parseSheet(
      { shelf: 'pattern', file: 'DT' },
      [
        '# Double Top — fiche pattern',
        '',
        '> **Shorter** un titre rejeté qui revient tester son high.',
        '',
        "*Dernière révision : 2026-09-25, d'après la séance du 21 septembre.*",
        '',
        '---',
        '',
        'Voir les [quatre vendeurs](../notes/four-sellers.fr.md) et le [penny break](penny-break.fr.md).',
      ].join('\n'),
    );

    expect(dt.title).toBe('Double Top');
    expect(dt.revisedOn?.getDate()).toBe(25);
    expect(dt.bodyHtml).not.toContain('Dernière révision');
    expect(dt.bodyHtml).toContain('<a href="#sheet-notes-four-sellers">quatre vendeurs</a>');
    expect(dt.bodyHtml).toContain('<a href="#sheet-pattern-penny-break">penny break</a>');
  });

  it('reads a sheet without a revision line as never revised', () => {
    const siv = parseSheet(
      { shelf: 'pattern', file: 'SIV' },
      '# Short Into VWAP — pattern sheet\n\n> **Missing — not written yet.**\n\nNo source yet.',
    );

    expect(siv.revisedOn).toBeNull();
    expect(siv.summaryHtml).toContain('Missing — not written yet.');
    expect(siv.bodyHtml).toContain('No source yet.');
  });
});

describe('sheetOf', () => {
  it('names the file an anchor points at, and nothing for one the page does not show', () => {
    expect(sheetOf('sheet-notes-four-sellers')).toEqual({ shelf: 'notes', file: 'four-sellers' });
    expect(sheetOf('sheet-pattern-FRD')).toBeNull();
  });
});
