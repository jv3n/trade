import { Observable } from 'rxjs';
import { TradingDay, TradingDayMarks } from './trading-day.model';

/**
 * Port — the « nothing today » marks of a trading day. A day with nothing declared comes back with
 * both marks null, never as an error.
 */
export abstract class TradingDayRepository {
  abstract get(date: Date): Observable<TradingDay>;
  /** Writes both marks ; a mark already set keeps its original instant. */
  abstract put(date: Date, marks: TradingDayMarks): Observable<TradingDay>;
}
