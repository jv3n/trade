import { Observable } from 'rxjs';

export type ConfigValueType = 'STRING' | 'INT' | 'SECRET' | 'ENUM' | 'EMAILS';

/**
 * One option on an ENUM-typed config key. `disabledReason` carries the property path of a
 * missing prerequisite (e.g. `market.twelvedata.api-key`) when the option exists but cannot be
 * selected — the live `twelvedata` toggle is gated on the Twelve Data API key being configured.
 * The UI renders the option as disabled and surfaces the path in a tooltip. `null` means the
 * option is available. `mock` options are never disabled (they don't require any key).
 */
export interface AllowedValue {
  value: string;
  disabledReason: string | null;
}

/**
 * One runtime config entry as exposed by the backend `/api/config` endpoint.
 *
 * Secret keys (API keys) carry `currentValue: null` and `defaultValue: null` even when set —
 * the server never echoes the actual secret value. The UI relies on `hasValue` / `isOverridden`
 * to render state.
 *
 * ENUM keys carry an `allowedValues` array of [AllowedValue] entries — the UI renders a toggle
 * group restricted to those values. Each option may carry a `disabledReason` for provider gating
 * (cf. Phase 4). The server rejects any value outside the list AND any switch to a value whose
 * `disabledReason` would not be null (defense in depth — UI grays out the option but a direct PUT
 * still gets a 400).
 */
export interface ConfigEntry {
  key: string;
  type: ConfigValueType;
  currentValue: string | null;
  defaultValue: string | null;
  hasValue: boolean;
  isOverridden: boolean;
  allowedValues: AllowedValue[] | null;
}

export interface TestConfigResult {
  ok: boolean;
  message: string;
}

/**
 * Port — runtime-editable settings (Twelve Data / Finnhub API keys, market cache TTL, LLM
 * provider + model).
 *
 * `set` PUTs the new value and returns the refreshed entry. `reset` DELETEs the override and
 * falls back to the YAML default. `test*` exercises a candidate API key against the real provider
 * without saving — the user can validate before committing. `testLlm` does the same for an LLM
 * (provider, model) pair : the candidate isn't persisted, the backend just runs a fixed
 * "Reply with exactly the word OK." prompt and returns latency + parse correctness.
 */
export abstract class ConfigRepository {
  abstract list(): Observable<ConfigEntry[]>;
  abstract set(key: string, value: string): Observable<ConfigEntry>;
  abstract reset(key: string): Observable<void>;
  abstract testTwelveData(value: string): Observable<TestConfigResult>;
  abstract testFinnhub(value: string): Observable<TestConfigResult>;
  abstract testAnthropic(value: string): Observable<TestConfigResult>;
  abstract testLlm(provider: string, model: string): Observable<TestConfigResult>;
}
