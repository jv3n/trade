import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AccountRepository } from '../account.repository';
import { HttpAccountRepository } from './account.http';

/**
 * Adapter contract test for [HttpAccountRepository] — pins the HTTP surface and the wire ↔ domain
 * mapping (ISO date parsing/formatting, signed amount pass-through, Spring `Page` unwrap) without a
 * running backend. The page / dialogs only ever see the domain types this adapter produces.
 */
describe('HttpAccountRepository', () => {
  let repo: AccountRepository;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AccountRepository, useClass: HttpAccountRepository },
      ],
    });
    repo = TestBed.inject(AccountRepository);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function movementWire(overrides: Record<string, unknown> = {}) {
    return {
      id: 'm1',
      type: 'WITHDRAWAL',
      amount: -1500,
      valueDate: '2026-06-15',
      note: 'Withdraw to bank',
      tradeEntryId: null,
      createdAt: '2026-06-15T10:00:00Z',
      updatedAt: '2026-06-15T10:00:00Z',
      ...overrides,
    };
  }

  it('findMovements forwards page coordinates and maps the Spring page + ISO dates', () => {
    let result: { content: { valueDate: Date; amount: number }[]; totalElements: number } | null =
      null;
    repo.findMovements({ pageIndex: 1, pageSize: 25 }).subscribe((r) => (result = r));

    const req = httpMock.expectOne((r) => r.url === '/api/account/movements');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('25');
    req.flush({
      content: [movementWire()],
      number: 1,
      size: 25,
      totalElements: 1,
      totalPages: 1,
    });

    expect(result!.totalElements).toBe(1);
    const row = result!.content[0];
    expect(row.amount).toBe(-1500); // signed amount passes through untouched
    expect(row.valueDate instanceof Date).toBe(true);
    expect(row.valueDate.getFullYear()).toBe(2026);
  });

  it('getSummary passes the aggregate through as-is', () => {
    let balance: number | null = null;
    repo.getSummary().subscribe((s) => (balance = s.balance));

    const req = httpMock.expectOne('/api/account/summary');
    expect(req.request.method).toBe('GET');
    req.flush({
      balance: 3800,
      totalDeposits: 5000,
      totalWithdrawals: -1500,
      netInjected: 3500,
      tradesPnl: 300,
      adjustments: 0,
      movementCount: 3,
    });

    expect(balance).toBe(3800);
  });

  it('getBalanceSeries maps each point and parses the ISO date', () => {
    let points: { date: Date; balance: number }[] = [];
    repo.getBalanceSeries().subscribe((p) => (points = p));

    const req = httpMock.expectOne('/api/account/balance-series');
    expect(req.request.method).toBe('GET');
    req.flush([
      { date: '2026-06-01', balance: 4000 },
      { date: '2026-06-05', balance: 4200 },
    ]);

    expect(points.length).toBe(2);
    expect(points[0].date instanceof Date).toBe(true);
    expect(points[0].date.getFullYear()).toBe(2026);
    expect(points[1].balance).toBe(4200);
  });

  it('addMovement posts the movement with the date formatted as yyyy-MM-dd', () => {
    repo
      .addMovement({
        type: 'DEPOSIT',
        amount: 5000,
        valueDate: new Date(2026, 5, 15), // 15 June 2026, local
        note: '  Wire in  ',
      })
      .subscribe();

    const req = httpMock.expectOne('/api/account/movements');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      type: 'DEPOSIT',
      amount: 5000,
      valueDate: '2026-06-15',
      note: 'Wire in', // trimmed by the adapter
    });
    req.flush(movementWire({ type: 'DEPOSIT', amount: 5000 }));
  });

  it('addMovement sends a null note when blank', () => {
    repo
      .addMovement({ type: 'DEPOSIT', amount: 10, valueDate: new Date(2026, 5, 15), note: '   ' })
      .subscribe();
    const req = httpMock.expectOne('/api/account/movements');
    expect(req.request.body.note).toBeNull();
    req.flush(movementWire());
  });

  it('correctBalance posts the target balance to the corrections endpoint', () => {
    repo
      .correctBalance({ targetBalance: 4850, valueDate: new Date(2026, 5, 15), note: null })
      .subscribe();

    const req = httpMock.expectOne('/api/account/corrections');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      targetBalance: 4850,
      valueDate: '2026-06-15',
      note: null,
    });
    req.flush(movementWire({ type: 'ADJUSTMENT', amount: -150 }));
  });

  it('updateMovement PUTs to the id path', () => {
    repo
      .updateMovement('m1', {
        type: 'WITHDRAWAL',
        amount: 1600,
        valueDate: new Date(2026, 5, 15),
        note: null,
      })
      .subscribe();

    const req = httpMock.expectOne('/api/account/movements/m1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.amount).toBe(1600);
    req.flush(movementWire());
  });

  it('deleteMovement DELETEs the id path', () => {
    let done = false;
    repo.deleteMovement('m1').subscribe(() => (done = true));

    const req = httpMock.expectOne('/api/account/movements/m1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(done).toBe(true);
  });
});
