import { Observable } from 'rxjs';
import { TradeEntry, TradeEntryFilter, TradeEntryInput } from './trade-entry.model';

/**
 * Port — CRUD over the trading journal. The port speaks the **domain** language only :
 * [TradeEntry] / [TradeEntryInput] / [TradeEntryFilter] with native `Date` types. The default
 * adapter (`HttpJournalRepository` in `adapters/journal.http.ts`) is responsible for
 * translating to / from the HTTP wire format (ISO strings, repeated query params, etc.).
 *
 * Tests can inject a stub via `useClass` or `useValue` ; nothing in this file leaks the
 * presence of HTTP, ISO strings, or backend DTOs.
 */
export abstract class JournalRepository {
  abstract findAll(filter?: TradeEntryFilter): Observable<TradeEntry[]>;
  abstract findById(id: string): Observable<TradeEntry>;
  abstract create(input: TradeEntryInput): Observable<TradeEntry>;
  abstract update(id: string, input: TradeEntryInput): Observable<TradeEntry>;
  abstract delete(id: string): Observable<void>;
}
