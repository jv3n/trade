import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { startOfDay } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { Candidate } from '../../../core/api/candidates/candidates.model';
import { AtOpenChange, OpenCard, PushReferences } from './open-card';

/**
 * Component spec for the « À l'open » card (cf. `mockup/PARCOURS.md › At the open`). What it pins :
 *
 * - **Target price** — open × (1 + target push), with the PM high vs the open and the gap in $ ;
 *   nothing without an open or without a reference.
 * - **References** — a row follows the selected one (average by default) ; switching it moves only
 *   the rows without a push of their own. The toggles show the figures of the completed GUS stats,
 *   and the no-push rate of the same stats beside them (#332).
 * - **Saving** — the open and the target push are handed to the page on blur, only when they
 *   changed ; typing the reference back, clearing the push or « back to the reference » hands over
 *   a `null` push (the row follows the reference again).
 * - **Plausibility** — a push above 100 % is kept but flagged (a small cap can push that far) ; one
 *   above 1000 % is a typo and is capped.
 *
 * The figures are the stats page mockup's : median +6.8 %, average +9.6 %, Q3 +14.2 %, max +21.5 %.
 */

const GUS_REFERENCES: PushReferences = {
  median: 6.8,
  average: 9.6,
  thirdQuartile: 14.2,
  max: 21.5,
};

/** MLGO of `mockup/candidat.html` : PM high 3.72, opening at 3.25. */
function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c-mlgo',
    tradingDate: startOfDay(new Date()),
    ticker: 'MLGO',
    previousClose: 1.95,
    pmOpen: 3.1,
    pmHigh: 3.72,
    floatMillions: 6.4,
    volumeMillions: 4.8,
    locatePerShare: 0.04,
    note: 'Résistance 3,75',
    openPrice: 3.25,
    targetPushPercent: null,
    stats: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup(
  candidates: Candidate[] = [makeCandidate()],
  references: PushReferences | null = GUS_REFERENCES,
): { fixture: ComponentFixture<OpenCard>; card: OpenCard; emitted: AtOpenChange[] } {
  TestBed.configureTestingModule({
    imports: [OpenCard],
    providers: [provideZonelessChangeDetection(), provideTranslateService({ lang: 'en' })],
  });
  const fixture = TestBed.createComponent(OpenCard);
  fixture.componentRef.setInput('candidates', candidates);
  fixture.componentRef.setInput('references', references);
  const emitted: AtOpenChange[] = [];
  fixture.componentInstance.atOpenChange.subscribe((change) => emitted.push(change));
  fixture.detectChanges();
  return { fixture, card: fixture.componentInstance, emitted };
}

describe('OpenCard', () => {
  // ---- Target price ----

  it('aims at the open plus the average push by default', () => {
    const { card } = setup();

    const [row] = card.rows();
    expect(row.push).toBe(9.6);
    expect(row.custom).toBe(false);
    expect(row.target).toBeCloseTo(3.562, 3); // 3.25 × 1.096
    expect(row.delta).toBeCloseTo(0.312, 3);
    expect(row.highVsOpen).toBeCloseTo(14.46, 2); // the PM high, often the resistance
  });

  it('has no target price until the open is typed', () => {
    const { card } = setup([makeCandidate({ openPrice: null })]);

    expect(card.rows()[0].target).toBeNull();
    expect(card.rows()[0].highVsOpen).toBeNull();
  });

  it('has no reference nor target price while no GUS stat is completed', () => {
    const { card } = setup([makeCandidate()], null);

    expect(card.noReference()).toBe(true);
    expect(card.rows()[0].push).toBeNull();
    expect(card.rows()[0].target).toBeNull();
  });

  // ---- References ----

  it('moves the rows following the reference when another one is selected', () => {
    const { card } = setup();

    card.selectKind('max');

    expect(card.rows()[0].push).toBe(21.5);
    expect(card.rows()[0].target).toBeCloseTo(3.949, 3);
  });

  it("keeps a candidate's own push when the reference changes", () => {
    // Tight float, expensive locate : this one is expected to run further than the average.
    const { card } = setup([makeCandidate({ targetPushPercent: 15 })]);

    card.selectKind('median');

    expect(card.rows()[0].push).toBe(15);
    expect(card.rows()[0].custom).toBe(true);
    expect(card.rows()[0].target).toBeCloseTo(3.7375, 4);
  });

  // #320 : « back to the reference » was offered on a row already showing the reference.
  it('offers no way back to the reference on a push that already equals it', () => {
    const { card } = setup([makeCandidate({ targetPushPercent: 9.6 })]);

    expect(card.rows()[0].push).toBe(9.6);
    expect(card.rows()[0].custom).toBe(false);
  });

  it('shows the GUS figures on the toggles', () => {
    expect(setup().card.dayReference('max')).toBe(21.5);
  });

  // 1 GUS in 11 never pushed : the references leave it out, the card says how often it happens.
  it('states the no-push rate of the same stats beside the references', () => {
    const { fixture, card } = setup();
    fixture.componentRef.setInput('noPushRate', { noPush: 1, completed: 11 });

    expect(card.dayNoPushRate()).toEqual(
      expect.objectContaining({ noPush: 1, completed: 11, percent: expect.closeTo(9.09, 2) }),
    );
  });

  it('shows no no-push rate when no day went without a push', () => {
    const { fixture, card } = setup();
    // Nothing to warn about : the references cover every completed stat (same rule as /stats).
    fixture.componentRef.setInput('noPushRate', { noPush: 0, completed: 11 });
    expect(card.dayNoPushRate()).toBeNull();
  });

  // #311 : « 3,9 × 15,3 % » must reproduce the target price printed beside it — the displayed
  // push drives it, not the unrounded average behind the reference.
  it('computes the target price from the push as it is displayed', () => {
    const { card } = setup([makeCandidate({ openPrice: 3.9 })], {
      ...GUS_REFERENCES,
      average: 15.32,
    });

    expect(card.rows()[0].push).toBe(15.3);
    expect(card.rows()[0].target).toBeCloseTo(4.4967, 4);
  });

  // ---- Saving ----

  it('shows a past day as text, with no field to type in', () => {
    const { fixture } = setup([makeCandidate({ targetPushPercent: 15 })]);
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('input.cell-input').length).toBe(0);
    expect(el.textContent).toContain('3.25');
    expect(el.textContent).toContain('15.0 %');
  });

  it('hands a typed open to the page on blur', () => {
    const mlgo = makeCandidate({ openPrice: null });
    const { card, emitted } = setup([mlgo]);

    card.draftOpen(mlgo, 3.25);
    card.commitOpen(mlgo);

    expect(emitted).toEqual([{ candidate: mlgo, patch: { openPrice: 3.25 } }]);
  });

  it('does not hand over an open that did not change', () => {
    const mlgo = makeCandidate({ openPrice: 3.25 });
    const { card, emitted } = setup([mlgo]);

    card.commitOpen(mlgo); // blur without typing
    card.draftOpen(mlgo, 3.25);
    card.commitOpen(mlgo); // typed the same value back

    expect(emitted).toEqual([]);
  });

  it('hands a typed push to the page on blur', () => {
    const { card, emitted } = setup();
    const [row] = card.rows();

    card.draftPush(row, 15);
    card.commitPush(row);

    expect(emitted).toEqual([{ candidate: row.candidate, patch: { targetPushPercent: 15 } }]);
  });

  // Hit in the pilot test : 15200 % was saved, aiming at 145 $ on a 1 $ stock.
  it('caps a typed push at 1000 %', () => {
    const { card, emitted } = setup();
    const [row] = card.rows();

    card.draftPush(row, 15200);
    card.commitPush(row);

    expect(emitted).toEqual([{ candidate: row.candidate, patch: { targetPushPercent: 1000 } }]);
  });

  it('flags a push above 100 % as unusual, without refusing it', () => {
    const { card } = setup([
      makeCandidate({ targetPushPercent: 250 }),
      makeCandidate({ id: 'c2', ticker: 'GLND', targetPushPercent: 100 }),
    ]);

    expect(card.rows().map((r) => r.unusualPush)).toEqual([true, false]);
  });

  it('puts a row back on the reference when the reference value is typed back or cleared', () => {
    const { card, emitted } = setup([makeCandidate({ targetPushPercent: 15 })]);
    const [row] = card.rows();

    card.draftPush(row, 9.6); // the average, typed back
    card.commitPush(row);
    card.draftPush(row, null); // the field emptied
    card.commitPush(row);

    expect(emitted.map((e) => e.patch)).toEqual([
      { targetPushPercent: null },
      { targetPushPercent: null },
    ]);
  });

  it('does not hand over the reference typed on a row that already follows it', () => {
    const { card, emitted } = setup();
    const [row] = card.rows();

    card.draftPush(row, 9.6);
    card.commitPush(row);

    expect(emitted).toEqual([]);
  });

  it('hands a null push over with « back to the reference »', () => {
    const { card, emitted } = setup([makeCandidate({ targetPushPercent: 15 })]);

    card.resetPush(card.rows()[0]);

    expect(emitted.map((e) => e.patch)).toEqual([{ targetPushPercent: null }]);
  });
});
