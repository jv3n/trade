import { Observable } from 'rxjs';

export type ConfigValueType = 'STRING' | 'EMAILS';

/**
 * One runtime config entry as exposed by the backend `/api/config` endpoint. The only runtime key
 * today is the login whitelist (`app.allowed.emails`, typed `EMAILS`).
 */
export interface ConfigEntry {
  key: string;
  type: ConfigValueType;
  currentValue: string | null;
  defaultValue: string | null;
  hasValue: boolean;
  isOverridden: boolean;
}

/**
 * Port — runtime-editable settings. `set` PUTs the new value and returns the refreshed entry.
 * `reset` DELETEs the override and falls back to the YAML default.
 */
export abstract class ConfigRepository {
  abstract list(): Observable<ConfigEntry[]>;
  abstract set(key: string, value: string): Observable<ConfigEntry>;
  abstract reset(key: string): Observable<void>;
}
