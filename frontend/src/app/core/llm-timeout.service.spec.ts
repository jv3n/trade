/**
 * Tests on [LlmTimeoutService] — the signal exposed to the `/settings/configuration > LLM` card
 * for the "estimation max" label next to the timeout slider. Audit 2026-05-10 finding #5 :
 * the service had no spec while its sibling `core/` services (`ThemeService`, `LanguageService`,
 * `OllamaStatusService`, `JobStreamService`) all do — small surface, but worth pinning so a future
 * refactor that breaks the prime / refresh contract surfaces in CI rather than at runtime.
 *
 * What we pin :
 *
 * - **Default at construction** : the signal exposes 400 (matches the YAML default in
 *   `application.yml`) before any `refresh()` resolves. The `provideAppInitializer` hook in
 *   `app.config.ts` only runs once on app boot, so any subscriber that reads the signal early
 *   sees this default rather than `undefined`.
 * - **Refresh success** : a positive numeric `currentValue` lands on the signal verbatim (no
 *   conversion to / from millis — that representation was removed when the legacy poll-abort
 *   adapters were retired).
 * - **Refresh keeps the current value on transient backend failures** : the configuration page
 *   stays usable on a flaky `/api/config` blip (the user can still see the previous label
 *   instead of a sudden default revert).
 * - **Refresh ignores garbage data** : null, missing entry, non-numeric, zero, or negative
 *   `currentValue` all keep the previous signal value rather than blanking it. Defensive against
 *   a bad manual SQL write or an upstream rename — the service must not amplify that into a
 *   visible regression on the LLM card.
 */
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { ConfigEntry, ConfigRepository, TestConfigResult } from './config.repository';
import { LlmTimeoutService } from './llm-timeout.service';

class StubRepository extends ConfigRepository {
  // Each `list()` call returns the next factory in the queue. Tests pin an exact sequence
  // (prime, then refresh-success, then refresh-failure) without juggling spies.
  listQueue: (() => Observable<ConfigEntry[]>)[] = [];
  callCount = 0;

  list(): Observable<ConfigEntry[]> {
    this.callCount += 1;
    const next = this.listQueue.shift();
    if (!next) {
      throw new Error('StubRepository: list queue is empty — test forgot to enqueue a response');
    }
    return next();
  }

  // Mutating endpoints aren't exercised by [LlmTimeoutService] but the abstract contract demands
  // them — wire them up to a clear test failure so a misuse is caught at the call site.
  set(): Observable<ConfigEntry> {
    throw new Error('LlmTimeoutService should not call set()');
  }
  reset(): Observable<void> {
    throw new Error('LlmTimeoutService should not call reset()');
  }
  testTwelveData(): Observable<TestConfigResult> {
    throw new Error('LlmTimeoutService should not call testTwelveData()');
  }
  testFinnhub(): Observable<TestConfigResult> {
    throw new Error('LlmTimeoutService should not call testFinnhub()');
  }
  testAnthropic(): Observable<TestConfigResult> {
    throw new Error('LlmTimeoutService should not call testAnthropic()');
  }
  testLlm(): Observable<TestConfigResult> {
    throw new Error('LlmTimeoutService should not call testLlm()');
  }
}

function entry(key: string, currentValue: string | null): ConfigEntry {
  // Sensible defaults so each test only overrides the field it cares about. The shape mirrors
  // what the backend `/api/config` returns for an INT runtime key.
  return {
    key,
    type: 'INT',
    currentValue,
    defaultValue: '400',
    hasValue: currentValue != null,
    isOverridden: currentValue != null,
    allowedValues: null,
  };
}

function setup(): { service: LlmTimeoutService; repo: StubRepository } {
  const repo = new StubRepository();
  TestBed.configureTestingModule({
    providers: [LlmTimeoutService, { provide: ConfigRepository, useValue: repo }],
  });
  return { service: TestBed.inject(LlmTimeoutService), repo };
}

describe('LlmTimeoutService', () => {
  it('exposes the default 400 before refresh() resolves', () => {
    const { service } = setup();
    // No refresh call yet — the signal must be readable and reflect the YAML-default mirror so
    // the configuration page label doesn't render `undefined s` on first paint.
    expect(service.seconds()).toBe(400);
  });

  it('updates the signal when refresh() returns a positive numeric currentValue', () => {
    const { service, repo } = setup();
    repo.listQueue.push(() => of([entry('llm.timeout-seconds', '600')]));

    service.refresh().subscribe();

    expect(service.seconds()).toBe(600);
  });

  it('keeps the previous value when refresh() is called and the backend throws', () => {
    const { service, repo } = setup();
    // First refresh primes a known value, second refresh fails — the signal must hold the primed
    // value rather than revert. This is the user-visible contract : a flaky `/api/config` blip
    // on save shouldn't blank the label back to the default while the user is editing.
    repo.listQueue.push(() => of([entry('llm.timeout-seconds', '600')]));
    repo.listQueue.push(() => throwError(() => new Error('502 Bad Gateway')));

    service.refresh().subscribe();
    service.refresh().subscribe();

    expect(service.seconds()).toBe(600);
  });

  it('keeps the previous value when refresh() returns no llm.timeout-seconds entry', () => {
    const { service, repo } = setup();
    // Backend rename or missing key — the service degrades closed (keep the prior value) rather
    // than zeroing out the signal. The previous behaviour would have surfaced as a misleading
    // "≈ 0 s" label.
    repo.listQueue.push(() => of([entry('market.cache.ttl-minutes', '15')]));

    service.refresh().subscribe();

    expect(service.seconds()).toBe(400);
  });

  it('keeps the previous value when currentValue is null, blank, or non-numeric', () => {
    const { service, repo } = setup();
    repo.listQueue.push(() => of([entry('llm.timeout-seconds', '600')]));
    service.refresh().subscribe();

    repo.listQueue.push(() => of([entry('llm.timeout-seconds', null)]));
    repo.listQueue.push(() => of([entry('llm.timeout-seconds', '')]));
    repo.listQueue.push(() => of([entry('llm.timeout-seconds', 'abc')]));
    service.refresh().subscribe();
    service.refresh().subscribe();
    service.refresh().subscribe();

    // Each garbage shape must leave the prior 600 value untouched. We assert at the end rather
    // than between calls so the test reads as "no matter what bad value lands, the signal is
    // sticky on the last known good value".
    expect(service.seconds()).toBe(600);
  });

  it('keeps the previous value when currentValue is zero or negative', () => {
    const { service, repo } = setup();
    repo.listQueue.push(() => of([entry('llm.timeout-seconds', '600')]));
    service.refresh().subscribe();

    // A 0 or negative timeout would translate to "abort immediately" on any future consumer that
    // ever reintroduces the abort path — defensive even though no consumer reads it today.
    repo.listQueue.push(() => of([entry('llm.timeout-seconds', '0')]));
    repo.listQueue.push(() => of([entry('llm.timeout-seconds', '-30')]));
    service.refresh().subscribe();
    service.refresh().subscribe();

    expect(service.seconds()).toBe(600);
  });
});
