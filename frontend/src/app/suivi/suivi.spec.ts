import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { Suivi } from './suivi';
import { SnapshotService, SnapshotSummary, SnapshotPosition } from '../core/snapshot.service';

const makeSummary = (overrides: Partial<SnapshotSummary> = {}): SnapshotSummary => ({
  id: 'snap-1',
  batchId: 'batch-1',
  portfolioId: 'p-1',
  portfolioName: 'CELI',
  importedAt: '2025-01-01T00:00:00Z',
  positionCount: 3,
  totalBookValueCad: 5000,
  ...overrides,
});

describe('Suivi', () => {
  let component: Suivi;
  let fixture: ComponentFixture<Suivi>;
  let snapshotService: { getAll: () => Observable<SnapshotSummary[]>, getPositions: () => Observable<SnapshotPosition[]> };

  beforeEach(async () => {
    snapshotService = {
      getAll: () => of([]),
      getPositions: () => of([]),
    };

    await TestBed.configureTestingModule({
      imports: [Suivi],
      providers: [{ provide: SnapshotService, useValue: snapshotService }],
    }).compileComponents();

    fixture = TestBed.createComponent(Suivi);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('gainClass returns positive for positive gain', () => {
    expect(component.gainClass(100)).toBe('positive');
    expect(component.gainClass(0)).toBe('positive');
  });

  it('gainClass returns negative for negative gain', () => {
    expect(component.gainClass(-50)).toBe('negative');
  });

  it('gainClass returns empty string for null', () => {
    expect(component.gainClass(null)).toBe('');
  });

  it('groups snapshots by batchId into batches', async () => {
    const summaries: SnapshotSummary[] = [
      makeSummary({ id: 's1', batchId: 'batch-A', portfolioName: 'CELI', totalBookValueCad: 3000 }),
      makeSummary({ id: 's2', batchId: 'batch-A', portfolioName: 'REER', totalBookValueCad: 2000 }),
      makeSummary({ id: 's3', batchId: 'batch-B', portfolioName: 'CELI', totalBookValueCad: 3200 }),
    ];
    snapshotService.getAll = () => of(summaries);

    fixture.detectChanges();
    await fixture.whenStable();

    const batches = component.batches();
    expect(batches.length).toBe(2);

    const batchA = batches.find(b => b.batchId === 'batch-A')!;
    expect(batchA.snapshots.length).toBe(2);
    expect(batchA.totalBookValueCad).toBe(5000);

    const batchB = batches.find(b => b.batchId === 'batch-B')!;
    expect(batchB.snapshots.length).toBe(1);
    expect(batchB.totalBookValueCad).toBe(3200);
  });

  it('toggleBatch flips expanded state', async () => {
    snapshotService.getAll = () => of([makeSummary()]);
    fixture.detectChanges();
    await fixture.whenStable();

    const batch = component.batches()[0];
    expect(batch.expanded).toBe(true);
    component.toggleBatch(batch);
    expect(batch.expanded).toBe(false);
    component.toggleBatch(batch);
    expect(batch.expanded).toBe(true);
  });

  it('toggleSnapshot adds and removes from expandedSnapshots', () => {
    fixture.detectChanges();
    expect(component.isSnapshotExpanded('s1')).toBe(false);
    component.toggleSnapshot('s1');
    expect(component.isSnapshotExpanded('s1')).toBe(true);
    component.toggleSnapshot('s1');
    expect(component.isSnapshotExpanded('s1')).toBe(false);
  });

  it('getPositions returns empty array before loading', () => {
    fixture.detectChanges();
    expect(component.getPositions('unknown')).toEqual([]);
  });

  it('shows error message on load failure', async () => {
    const { throwError } = await import('rxjs');
    snapshotService.getAll = () => throwError(() => new Error('network'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.error()).toContain('Impossible');
  });
});
