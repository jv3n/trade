import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RuleScore, RuleScoreMonths, RuleScoreRow } from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { RuleScoreReport } from './rule-score-report';

/**
 * The « Règles GUS » tab (#205), against a stubbed repository :
 *
 *  - **The window** is three months unless another was chosen ; a choice asks again and comes back on
 *    the next visit — a window no longer offered falls back to three months.
 *  - **A rule with 20 triggered trades or more** reads its hit rate with its x / n, its signed
 *    averages and its expectancy, gains green and losses red.
 *  - **Under 20** the figures give way to « — » and the n against 20 : a rate over a handful of
 *    rows says nothing.
 *  - **A failed load** shows its banner, and « retry » asks again.
 *  - **A slow first load** draws the table itself over ghost rows, inside the one card, announced,
 *    with the window subtitle held — so nothing moves when the figures land (#757).
 */
function row(overrides: Partial<RuleScoreRow> = {}): RuleScoreRow {
  return {
    rule: 'TEN_FORTY',
    entryPercent: 10,
    stopPercent: 40,
    triggered: 41,
    stopped: 7,
    wins: 27,
    averageWinPercent: 16.8,
    averageLossPercent: -15.1,
    winLossRatio: 1.11,
    expectancyPercent: 5.9,
    ...overrides,
  };
}

/** The mockup's three months : 58 completed GUS, 10 / 40 over the threshold, 7 / 31 under it. */
function makeScore(): RuleScore {
  return {
    dateFrom: new Date(2026, 6, 19),
    dateTo: new Date(2026, 9, 19),
    completed: 58,
    rules: [
      row(),
      row({
        rule: 'SEVEN_THIRTY_ONE',
        entryPercent: 7,
        stopPercent: 31,
        triggered: 12,
        stopped: 2,
        wins: 8,
        expectancyPercent: -2.4,
      }),
    ],
  };
}

describe('RuleScoreReport', () => {
  let ruleScore: ReturnType<typeof vi.fn<(months: RuleScoreMonths) => Observable<RuleScore>>>;

  beforeEach(() => {
    localStorage.clear();
    ruleScore = vi.fn(() => of(makeScore()));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        { provide: StatsRepository, useValue: { ruleScore } },
      ],
    });
  });

  afterEach(() => localStorage.clear());

  async function render(): Promise<ComponentFixture<RuleScoreReport>> {
    const fixture = TestBed.createComponent(RuleScoreReport);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function cell(fixture: ComponentFixture<RuleScoreReport>, rule: string, testId: string) {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-testid="rule-${rule}"] [data-testid="${testId}"]`,
    )!;
  }

  function click(fixture: ComponentFixture<RuleScoreReport>, testId: string): void {
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>(`[data-testid="${testId}"] button`)!
      .click();
  }

  it('asks for the last three months by default', async () => {
    await render();

    expect(ruleScore).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('reads a rule over the threshold : its hit rate with its n, and its expectancy in green', async () => {
    const fixture = await render();

    // 27 / 41 = 65.85 %.
    expect(cell(fixture, 'TEN_FORTY', 'hit-rate').textContent).toContain('65.9 %');
    expect(cell(fixture, 'TEN_FORTY', 'hit-rate').textContent).toContain('27 / 41');
    const expectancy = cell(fixture, 'TEN_FORTY', 'expectancy');
    expect(expectancy.textContent?.trim()).toBe('+5.9 %');
    expect(expectancy.classList).toContain('pos');
  });

  it('shows no rate under 20 triggered trades, only the n against 20', async () => {
    const fixture = await render();

    const hitRate = cell(fixture, 'SEVEN_THIRTY_ONE', 'hit-rate').textContent ?? '';
    expect(hitRate).toContain('—');
    expect(hitRate).toContain('12 / 20');
    const expectancy = cell(fixture, 'SEVEN_THIRTY_ONE', 'expectancy');
    expect(expectancy.textContent?.trim()).toBe('—');
    expect(expectancy.classList).not.toContain('neg');
  });

  it('asks again for the window chosen, and remembers it for the next visit', async () => {
    const fixture = await render();

    click(fixture, 'months-6');
    await fixture.whenStable();

    expect(ruleScore).toHaveBeenLastCalledWith(6);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        { provide: StatsRepository, useValue: { ruleScore } },
      ],
    });
    await render();
    expect(ruleScore).toHaveBeenLastCalledWith(6);
  });

  it('falls back to three months when the window remembered is no longer offered', async () => {
    localStorage.setItem('reports.rules.months', '4');

    await render();

    expect(ruleScore).toHaveBeenCalledExactlyOnceWith(3);
  });

  // #757 : a generic card skeleton drew a second card inside this one, said nothing to a screen
  // reader and was half the table's height.
  it('draws the real header over two ghost rows on a slow first load, inside the one card', async () => {
    vi.useFakeTimers();
    const answer = new Subject<RuleScore>();
    ruleScore.mockReturnValueOnce(answer);
    const fixture = TestBed.createComponent(RuleScoreReport);
    fixture.detectChanges();
    vi.advanceTimersByTime(200);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    const skeleton = el.querySelector('[data-testid="rules-skeleton"]')!;
    expect(skeleton.querySelectorAll('th').length).toBe(7);
    expect(skeleton.querySelectorAll('tbody tr').length).toBe(2);
    expect(el.querySelectorAll('mat-card').length).toBe(1);
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    expect(skeleton.querySelector('.cdk-visually-hidden')?.textContent).toBe(
      'reports.rules.loading',
    );
    expect(el.querySelector('.card-title .hint ui-skeleton')).not.toBeNull();
    expect(el.querySelector('.note')).not.toBeNull();

    answer.next(makeScore());
    answer.complete();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="rules-skeleton"]')).toBeNull();
    expect(el.querySelectorAll('[data-testid="rules-table"] tbody tr').length).toBe(2);
    expect(el.querySelector('[data-testid="rule-window"]')).not.toBeNull();
    vi.useRealTimers();
  });

  it('shows a banner on a failed load, and retry asks again', async () => {
    ruleScore.mockReturnValueOnce(throwError(() => new Error('down')));
    const fixture = await render();
    const banner = (fixture.nativeElement as HTMLElement).querySelector('.error-banner');
    expect(banner).not.toBeNull();

    banner!.querySelector('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(ruleScore).toHaveBeenCalledTimes(2);
    expect((fixture.nativeElement as HTMLElement).querySelector('.error-banner')).toBeNull();
  });
});
