import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Candidate, CandidateInput } from '../../core/api/candidates/candidates.model';
import { CandidatesRepository } from '../../core/api/candidates/candidates.repository';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { CandidatesPage } from './candidates-page';

/**
 * Component spec for the candidates cockpit. The pure arithmetic is pinned in
 * `candidates.math.spec`, so here we focus on the wiring : the day's candidates load on init, the
 * derived signals react to the form model, and *Save* routes to create-vs-update correctly. The
 * repository / dialog / snackbar are stubbed so nothing touches HTTP.
 */
function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c1',
    tradingDate: new Date(2026, 5, 19),
    ticker: 'CASST',
    totalCapital: 7300,
    pctCapitalAtRisk: 5,
    openPrice: 12.04,
    stopPct: 40,
    previousClose: 3.9,
    floatShares: null,
    volume: null,
    morningPush: null,
    borrowCostPerShare: null,
    fills: [],
    entries: [],
    exits: [],
    note: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Mock port — **extends** the abstract `CandidatesRepository` (not a plain object literal) so the
 * stub stays type-safe against the real contract and inherits any concrete base methods. Per the
 * `angular-signals` port convention : `useClass MockXxx extends XxxRepository`, never `useValue`.
 */
class MockCandidatesRepository extends CandidatesRepository {
  listForDate = vi.fn((): Observable<Candidate[]> => of([]));
  get = vi.fn((): Observable<Candidate> => of(makeCandidate()));
  create = vi.fn((_input: CandidateInput): Observable<Candidate> =>
    of(makeCandidate({ id: 'new' })),
  );
  update = vi.fn((): Observable<Candidate> => of(makeCandidate()));
  delete = vi.fn((): Observable<void> => of(undefined));
}

function setup(): {
  fixture: ComponentFixture<CandidatesPage>;
  page: CandidatesPage;
  repo: MockCandidatesRepository;
} {
  TestBed.configureTestingModule({
    imports: [CandidatesPage],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      provideNativeDateAdapter(),
      { provide: CandidatesRepository, useClass: MockCandidatesRepository },
      { provide: StatsRepository, useValue: { create: vi.fn(() => of(undefined)) } },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
      { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(undefined) }) } },
    ],
  });
  const repo = TestBed.inject(CandidatesRepository) as MockCandidatesRepository;
  const fixture = TestBed.createComponent(CandidatesPage);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, repo };
}

describe('CandidatesPage', () => {
  it('loads the day’s candidates on init', () => {
    const { repo } = setup();
    expect(repo.listForDate).toHaveBeenCalledTimes(1);
  });

  it('derives the risk budget and the entry ladder from the form model', () => {
    const { page } = setup();
    page.setTotalCapital(7300);
    page.setPctCapitalAtRisk(5);
    page.setOpenPrice(12.04);
    page.setStopPct(40);

    expect(page.riskBudget()).toBe(365);
    // +35% rung sized so a stop-out at +40% costs the $365 budget → 606 shares (rounded).
    const rung = page.ladder().find((r) => r.step === 0.35)!;
    expect(rung.maxShares).toBe(606);
  });

  it('overlays filled shares into the execution average position', () => {
    const { page } = setup();
    page.setTotalCapital(7300);
    page.setOpenPrice(12.04);
    page.setStopPct(40);
    page.setFill(0.1, 200);
    page.setFill(0.2, 400);

    expect(page.execution().totalShares).toBe(600);
    expect(page.execution().averagePosition).toBeCloseTo(14.05, 2);
  });

  it('scores the cover against the free-form entries average, not the fixed-rung fills', () => {
    // Decision : the average short position now comes from the actual-entries table (the rung
    // tracker is sizing-only). One leg of 200 @ 3.21 with open 5 / stop 40 % → stop price 7.00.
    const { page } = setup();
    page.setOpenPrice(5);
    page.setStopPct(40);
    page.addEntry();
    page.setEntryPrice(0, 3.21);
    page.setEntryShares(0, 200);

    expect(page.entryTable().averagePosition).toBeCloseTo(3.21, 2);
    expect(page.entryTable().totalCurrentRisk).toBeCloseTo(758, 0); // 200 × (7 − 3.21)

    // Covering 100 below the 3.21 average is a gain : (3.21 − 3.00) × 100 ≈ 21.
    page.addExit();
    page.setExitPrice(0, 3.0);
    page.setExitShares(0, 100);
    expect(page.cover().rows[0].dollarGainLoss).toBeCloseTo(21, 0);
  });

  it('creates a new candidate when no id is held', () => {
    const { page, repo } = setup();
    page.model.update((m) => ({ ...m, ticker: 'CASST', totalCapital: 7300, openPrice: 12.04 }));

    page.save();

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.update).not.toHaveBeenCalled();
    expect(page.selectedId()).toBe('new'); // id captured from the saved candidate
  });

  it('saves through the upsert create endpoint even when a candidate is loaded', () => {
    // Save always upserts by (date, ticker) server-side — never a blind update-by-id — so changing
    // the ticker targets a different candidate instead of overwriting the loaded one.
    const { page, repo } = setup();
    page.onSelect('c1'); // loads CASST → selectedId = 'c1'
    page.save();

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
