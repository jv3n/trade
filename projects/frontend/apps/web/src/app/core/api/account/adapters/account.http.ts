import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { format, parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import {
  AccountMovement,
  AccountMovementInput,
  AccountMovementType,
  AccountSummary,
  BalancePoint,
  Reconciliation,
  ReconciliationInput,
} from '../account.model';
import { AccountRepository, PageRequest, PagedResult } from '../account.repository';

// ---------------------------------------------------------------------------
// Wire DTOs — the shape Spring Boot serialises on `/api/account`. Kept private : consumers of
// `AccountRepository` only ever see the domain types. The only delta from the domain is the date
// serialisation (`LocalDate` → `YYYY-MM-DD`, `Instant` → ISO-8601 `Z`).
// ---------------------------------------------------------------------------

interface AccountMovementWireDto {
  id: string;
  type: AccountMovementType;
  amount: number;
  valueDate: string;
  note: string | null;
  tradeEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MovementWireRequest {
  type: AccountMovementType;
  amount: number;
  valueDate: string;
  note: string | null;
}

interface ReconciliationWireDto {
  id: string;
  valueDate: string;
  brokerBalance: number;
  appBalance: number;
  gap: number;
  correctionId: string | null;
  reconciledAt: string;
}

interface BalancePointWireDto {
  date: string;
  balance: number;
}

interface SpringPageWireDto<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

function fromWire(w: AccountMovementWireDto): AccountMovement {
  return {
    id: w.id,
    type: w.type,
    amount: w.amount,
    valueDate: parseISO(w.valueDate),
    note: w.note,
    tradeEntryId: w.tradeEntryId,
    createdAt: parseISO(w.createdAt),
    updatedAt: parseISO(w.updatedAt),
  };
}

function fromPageWire(p: SpringPageWireDto<AccountMovementWireDto>): PagedResult<AccountMovement> {
  return {
    content: p.content.map(fromWire),
    pageIndex: p.number,
    pageSize: p.size,
    totalElements: p.totalElements,
    totalPages: p.totalPages,
  };
}

/** The morning's date stays a local day ; `reconciledAt` is an instant. Same rule as elsewhere. */
function reconciliationFromWire(w: ReconciliationWireDto): Reconciliation {
  return { ...w, valueDate: parseISO(w.valueDate), reconciledAt: parseISO(w.reconciledAt) };
}

function toMovementWire(input: AccountMovementInput): MovementWireRequest {
  return {
    type: input.type,
    amount: input.amount,
    valueDate: format(input.valueDate, 'yyyy-MM-dd'),
    note: input.note?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

@Injectable()
export class HttpAccountRepository extends AccountRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/account';

  findMovements(page?: PageRequest): Observable<PagedResult<AccountMovement>> {
    let params = new HttpParams();
    if (page) {
      params = params.set('page', page.pageIndex).set('size', page.pageSize);
    }
    return this.http
      .get<SpringPageWireDto<AccountMovementWireDto>>(`${this.base}/movements`, { params })
      .pipe(map(fromPageWire));
  }

  getSummary(): Observable<AccountSummary> {
    // Wire shape is identical to the domain (all numbers, no dates) — pass through.
    return this.http.get<AccountSummary>(`${this.base}/summary`);
  }

  getBalanceSeries(): Observable<BalancePoint[]> {
    return this.http
      .get<BalancePointWireDto[]>(`${this.base}/balance-series`)
      .pipe(map((pts) => pts.map((p) => ({ date: parseISO(p.date), balance: p.balance }))));
  }

  addMovement(input: AccountMovementInput): Observable<AccountMovement> {
    return this.http
      .post<AccountMovementWireDto>(`${this.base}/movements`, toMovementWire(input))
      .pipe(map(fromWire));
  }

  reconcile(input: ReconciliationInput): Observable<Reconciliation> {
    return this.http
      .post<ReconciliationWireDto>(`${this.base}/reconciliations`, {
        brokerBalance: input.brokerBalance,
        valueDate: format(input.valueDate, 'yyyy-MM-dd'),
      })
      .pipe(map(reconciliationFromWire));
  }

  reconciliations(limit = 10): Observable<Reconciliation[]> {
    return this.http
      .get<ReconciliationWireDto[]>(`${this.base}/reconciliations`, {
        params: new HttpParams().set('limit', limit),
      })
      .pipe(map((rows) => rows.map(reconciliationFromWire)));
  }

  updateMovement(id: string, input: AccountMovementInput): Observable<AccountMovement> {
    return this.http
      .put<AccountMovementWireDto>(`${this.base}/movements/${id}`, toMovementWire(input))
      .pipe(map(fromWire));
  }

  deleteMovement(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/movements/${id}`);
  }
}
