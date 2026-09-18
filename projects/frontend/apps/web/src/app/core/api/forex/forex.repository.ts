import { Observable } from 'rxjs';
import { ForexRate } from './forex.model';

/**
 * Port — foreign-exchange reference rates. One method today : the latest rate for a pair, used by
 * the account page to display the USD balance converted to another currency.
 *
 * Tests can inject a stub via `useClass` / `useValue` without touching HTTP.
 */
export abstract class ForexRepository {
  /** Latest reference rate for [base]→[quote]. Both default to the only pair the UI needs (USD→CAD). */
  abstract latestRate(base?: string, quote?: string): Observable<ForexRate>;
}
