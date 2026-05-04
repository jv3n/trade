import { Observable } from 'rxjs';

export type ConfigValueType = 'STRING' | 'INT' | 'SECRET' | 'ENUM';

/**
 * One runtime config entry as exposed by the backend `/api/config` endpoint.
 *
 * Secret keys (API keys) carry `currentValue: null` and `defaultValue: null` even when set —
 * the server never echoes the actual secret value. The UI relies on `hasValue` / `isOverridden`
 * to render state.
 *
 * ENUM keys carry an `allowedValues` array — the UI renders a toggle group restricted to those
 * values. The server rejects any value outside the list.
 */
export interface ConfigEntry {
  key: string;
  type: ConfigValueType;
  currentValue: string | null;
  defaultValue: string | null;
  hasValue: boolean;
  isOverridden: boolean;
  allowedValues: string[] | null;
}

export interface TestConfigResult {
  ok: boolean;
  message: string;
}

/**
 * Port — runtime-editable settings (Twelve Data / Finnhub API keys, market cache TTL).
 *
 * `set` PUTs the new value and returns the refreshed entry. `reset` DELETEs the override and
 * falls back to the YAML default. `test*` exercises a candidate API key against the real provider
 * without saving — the user can validate before committing.
 */
export abstract class ConfigRepository {
  abstract list(): Observable<ConfigEntry[]>;
  abstract set(key: string, value: string): Observable<ConfigEntry>;
  abstract reset(key: string): Observable<void>;
  abstract testTwelveData(value: string): Observable<TestConfigResult>;
  abstract testFinnhub(value: string): Observable<TestConfigResult>;
}
