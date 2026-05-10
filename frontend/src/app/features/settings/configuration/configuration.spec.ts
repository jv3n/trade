/**
 * Tests on the runtime configuration page. The component is a thin orchestrator over
 * [ConfigRepository] — these tests pin the user-visible behaviours, not the wire format (which is
 * covered by `config.http.spec.ts`).
 *
 * What we pin :
 * - **Init load** populates the entries signal from the repository.
 * - **Save secret** clears the input after success — the saved key is now masked server-side and
 *   leaving the typed value on screen would be a quiet leak.
 * - **Test before save** routes to `testTwelveData` / `testFinnhub` based on the key being edited
 *   and stores the result so the UI can render the green/red banner.
 * - **Reset** triggers a re-fetch — the server has the canonical "default" value and we don't
 *   guess client-side.
 * - **TTL slider dirty check** — Save button is enabled only when the slider value moved from
 *   the saved value. Otherwise re-saving the same TTL would no-op the cache rebuild but still
 *   look like an action took place.
 * - **Sector dependency hint** — the Twelve Data card surfaces a hint about the Finnhub key
 *   being required for the Sector benchmark, but only when that key is unset. If the user
 *   has already set Finnhub the hint disappears so it doesn't become noise.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { Configuration } from './configuration';
import { ConfigEntry, ConfigRepository } from '../../../core/config.repository';
import { LlmTimeoutService } from '../../../core/llm-timeout.service';
import { OllamaStatusService } from '../../../core/ollama-status.service';
import { OllamaStatus } from '../../../core/ollama-status.repository';

const TWELVE: ConfigEntry = {
  key: 'market.twelvedata.api-key',
  type: 'SECRET',
  currentValue: null,
  defaultValue: null,
  hasValue: true,
  isOverridden: true,
  allowedValues: null,
};

const FINN: ConfigEntry = {
  key: 'market.finnhub.api-key',
  type: 'SECRET',
  currentValue: null,
  defaultValue: null,
  hasValue: false,
  isOverridden: false,
  allowedValues: null,
};

const ANTHROPIC: ConfigEntry = {
  key: 'anthropic.api.key',
  type: 'SECRET',
  currentValue: null,
  defaultValue: null,
  hasValue: true,
  isOverridden: false,
  allowedValues: null,
};

const TTL: ConfigEntry = {
  key: 'market.cache.ttl-minutes',
  type: 'INT',
  currentValue: '30',
  defaultValue: '15',
  hasValue: true,
  isOverridden: true,
  allowedValues: null,
};

const MARKET_PROVIDER: ConfigEntry = {
  key: 'market.provider',
  type: 'ENUM',
  currentValue: 'mock',
  defaultValue: 'mock',
  hasValue: true,
  isOverridden: false,
  allowedValues: ['mock', 'twelvedata'],
};

const NEWS_PROVIDER: ConfigEntry = {
  key: 'news.provider',
  type: 'ENUM',
  currentValue: 'mock',
  defaultValue: 'mock',
  hasValue: true,
  isOverridden: false,
  allowedValues: ['mock', 'finnhub'],
};

const ANALYST_PROVIDER: ConfigEntry = {
  key: 'analyst.provider',
  type: 'ENUM',
  currentValue: 'mock',
  defaultValue: 'mock',
  hasValue: true,
  isOverridden: false,
  allowedValues: ['mock', 'finnhub'],
};

const EARNINGS_PROVIDER: ConfigEntry = {
  key: 'earnings.provider',
  type: 'ENUM',
  currentValue: 'mock',
  defaultValue: 'mock',
  hasValue: true,
  isOverridden: false,
  allowedValues: ['mock', 'finnhub'],
};

const LLM_PROVIDER: ConfigEntry = {
  key: 'llm.provider',
  type: 'ENUM',
  currentValue: 'ollama',
  defaultValue: 'claude',
  hasValue: true,
  isOverridden: true,
  allowedValues: ['claude', 'ollama'],
};

const OLLAMA_MODEL: ConfigEntry = {
  key: 'ollama.model',
  type: 'STRING',
  currentValue: 'qwen2.5:3b',
  defaultValue: 'qwen2.5:3b',
  hasValue: true,
  isOverridden: false,
  allowedValues: null,
};

const ANTHROPIC_MODEL: ConfigEntry = {
  key: 'anthropic.api.model',
  type: 'STRING',
  currentValue: 'claude-opus-4-6',
  defaultValue: 'claude-opus-4-6',
  hasValue: true,
  isOverridden: false,
  allowedValues: null,
};

const LLM_TIMEOUT: ConfigEntry = {
  key: 'llm.timeout-seconds',
  type: 'INT',
  currentValue: '600',
  defaultValue: '400',
  hasValue: true,
  isOverridden: true,
  allowedValues: null,
};

describe('Configuration', () => {
  let component: Configuration;
  let fixture: ComponentFixture<Configuration>;
  let repo: {
    list: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    testTwelveData: ReturnType<typeof vi.fn>;
    testFinnhub: ReturnType<typeof vi.fn>;
    testAnthropic: ReturnType<typeof vi.fn>;
    testLlm: ReturnType<typeof vi.fn>;
  };
  let timeoutServiceMock: { refresh: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    // Clear the section-persistence key so each test starts on the default ("providers") section
    // — without this, a previous test that flipped to "llm" would leak into the next fixture.
    localStorage.clear();
    repo = {
      list: vi
        .fn()
        .mockReturnValue(
          of([
            TTL,
            FINN,
            ANTHROPIC,
            MARKET_PROVIDER,
            TWELVE,
            NEWS_PROVIDER,
            ANALYST_PROVIDER,
            EARNINGS_PROVIDER,
            LLM_PROVIDER,
            OLLAMA_MODEL,
            ANTHROPIC_MODEL,
            LLM_TIMEOUT,
          ]),
        ),
      set: vi.fn().mockImplementation((key: string, value: string) =>
        of({
          ...TWELVE,
          key,
          currentValue: value,
          hasValue: true,
          isOverridden: true,
        } satisfies ConfigEntry),
      ),
      reset: vi.fn().mockReturnValue(of(undefined)),
      testTwelveData: vi.fn().mockReturnValue(of({ ok: true, message: 'OK' })),
      testFinnhub: vi.fn().mockReturnValue(of({ ok: true, message: 'OK' })),
      testAnthropic: vi.fn().mockReturnValue(of({ ok: true, message: 'OK' })),
      testLlm: vi.fn().mockReturnValue(of({ ok: true, message: 'OK' })),
    };
    timeoutServiceMock = {
      refresh: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Configuration],
      providers: [
        provideTranslateService({ lang: 'en' }),
        { provide: ConfigRepository, useValue: repo },
        // The component triggers timeoutService.refresh() after save/reset of the LLM timeout
        // key. Real service would re-fetch /api/config — we mock it so the test focuses on the
        // contract (was refresh called ?) rather than the wire details.
        {
          provide: LlmTimeoutService,
          useValue: {
            ...timeoutServiceMock,
            seconds: signal(400).asReadonly(),
            millis: () => 400_000,
          },
        },
        // OllamaStatusPanel is mounted inside the LLM section conditionally. Once a test flips
        // `activeSection` to 'llm' with llm.provider=ollama, the panel boots and tries to inject
        // OllamaStatusService. We provide a mock that exposes a static snapshot signal — the real
        // polling behaviour is exercised in ollama-status.service.spec.ts.
        {
          provide: OllamaStatusService,
          useValue: {
            status: signal<OllamaStatus | null>(null).asReadonly(),
            startPolling: vi.fn(),
            stopPolling: vi.fn(),
            refresh: vi.fn().mockResolvedValue(undefined),
            unload: vi.fn().mockResolvedValue(undefined),
            pull: vi.fn(),
            delete: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Configuration);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('loads the entries on init', () => {
    expect(repo.list).toHaveBeenCalledTimes(1);
    expect(component.entries().length).toBe(12);
    expect(component.twelveData()?.key).toBe('market.twelvedata.api-key');
    expect(component.anthropicKey()?.key).toBe('anthropic.api.key');
    expect(component.anthropicKey()?.type).toBe('SECRET');
    expect(component.cacheTtl()?.currentValue).toBe('30');
    expect(component.marketProvider()?.allowedValues).toEqual(['mock', 'twelvedata']);
    expect(component.newsProvider()?.allowedValues).toEqual(['mock', 'finnhub']);
    expect(component.analystProvider()?.allowedValues).toEqual(['mock', 'finnhub']);
    expect(component.earningsProvider()?.allowedValues).toEqual(['mock', 'finnhub']);
    expect(component.llmProvider()?.allowedValues).toEqual(['claude', 'ollama']);
    expect(component.ollamaModel()?.currentValue).toBe('qwen2.5:3b');
    expect(component.anthropicModel()?.currentValue).toBe('claude-opus-4-6');
    expect(component.llmTimeout()?.currentValue).toBe('600');
  });

  it('primes the TTL slider from the server value', () => {
    // Without this the slider would default to 15 (boot constant) even when the saved value is
    // 30 — the user would see "default position" on a non-default config, then sliding back to
    // 30 would look like a no-op.
    expect(component.ttlValue()).toBe(30);
  });

  it('save on a secret key clears the typed input after success', () => {
    component.onInput('market.twelvedata.api-key', 'rotated-key');
    component.save('market.twelvedata.api-key');

    expect(repo.set).toHaveBeenCalledWith('market.twelvedata.api-key', 'rotated-key');
    // After save the input is cleared so the rotated key doesn't linger on screen — the saved
    // value is now masked server-side and reading it back would be inconsistent UX.
    expect(component.editValue('market.twelvedata.api-key')).toBe('');
  });

  it('save trims whitespace before sending', () => {
    component.onInput('market.twelvedata.api-key', '  spaced-key  ');
    component.save('market.twelvedata.api-key');

    expect(repo.set).toHaveBeenCalledWith('market.twelvedata.api-key', 'spaced-key');
  });

  it('save records an error when the backend rejects the value', () => {
    repo.set.mockReturnValueOnce(
      throwError(() => ({ status: 400, error: { error: 'must be 5..60' } })),
    );

    component.onInput('market.cache.ttl-minutes', '120');
    component.save('market.cache.ttl-minutes');

    expect(component.saveErrors()['market.cache.ttl-minutes']).toBe('must be 5..60');
  });

  it('test routes to the right adapter method based on the key', () => {
    component.onInput('market.twelvedata.api-key', 'tw-candidate');
    component.test('market.twelvedata.api-key');
    expect(repo.testTwelveData).toHaveBeenCalledWith('tw-candidate');
    expect(repo.testFinnhub).not.toHaveBeenCalled();
    expect(repo.testAnthropic).not.toHaveBeenCalled();

    component.onInput('market.finnhub.api-key', 'fn-candidate');
    component.test('market.finnhub.api-key');
    expect(repo.testFinnhub).toHaveBeenCalledWith('fn-candidate');

    component.onInput('anthropic.api.key', 'sk-ant-candidate');
    component.test('anthropic.api.key');
    expect(repo.testAnthropic).toHaveBeenCalledWith('sk-ant-candidate');
  });

  it('test result is stored under the key it was triggered for', () => {
    repo.testFinnhub.mockReturnValueOnce(of({ ok: false, message: 'Invalid' }));
    component.onInput('market.finnhub.api-key', 'bad');
    component.test('market.finnhub.api-key');

    expect(component.testResults()['market.finnhub.api-key']).toEqual({
      ok: false,
      message: 'Invalid',
    });
    // Sibling keys keep their own result space — a failed Finnhub test doesn't poison the
    // Twelve Data card.
    expect(component.testResults()['market.twelvedata.api-key']).toBeUndefined();
  });

  it('a fresh edit invalidates the previous test result', () => {
    component.onInput('market.twelvedata.api-key', 'first');
    component.test('market.twelvedata.api-key');
    expect(component.testResults()['market.twelvedata.api-key']).toEqual({
      ok: true,
      message: 'OK',
    });

    component.onInput('market.twelvedata.api-key', 'second');
    expect(component.testResults()['market.twelvedata.api-key']).toBeUndefined();
  });

  it('reset triggers a re-fetch so currentValue is back in sync with the server default', () => {
    component.reset('market.cache.ttl-minutes');

    expect(repo.reset).toHaveBeenCalledWith('market.cache.ttl-minutes');
    // list called once on init + once after reset.
    expect(repo.list).toHaveBeenCalledTimes(2);
  });

  it('ttlDirty is false when the slider equals the saved value', () => {
    // Saved value is 30 (set in TTL fixture). Slider is primed to 30 on init.
    expect(component.ttlDirty()).toBe(false);
  });

  it('ttlDirty becomes true after the slider moves', () => {
    component.onTtlChange(45);
    expect(component.ttlValue()).toBe(45);
    expect(component.ttlDirty()).toBe(true);
  });

  it('selectProvider saves immediately', () => {
    // Provider toggles save on click — no dirty-tracking, no Save button. The whole point of the
    // toggle UX is that the change happens *now*.
    component.selectProvider('market.provider', 'twelvedata');
    expect(repo.set).toHaveBeenCalledWith('market.provider', 'twelvedata');
  });

  it('selectProvider is a no-op when the value is unchanged', () => {
    // Clicking the already-selected button shouldn't fire a save — pointless DB write and
    // would also fire a CacheTtlListener-style event for no reason.
    component.selectProvider('market.provider', 'mock');
    expect(repo.set).not.toHaveBeenCalled();
  });

  it('selectProvider routes analyst.provider to the right key', () => {
    // Mirror of the market/news provider tests — the toggle must hand the analyst key through to
    // the repository so the backend's RoutingAnalystClient picks up the switch on the next call.
    component.selectProvider('analyst.provider', 'finnhub');
    expect(repo.set).toHaveBeenCalledWith('analyst.provider', 'finnhub');
  });

  it('selectProvider routes earnings.provider to the right key', () => {
    // Same contract for earnings — the routing client reads earnings.provider per call, so a
    // wrong key here would silently fail to switch the adapter.
    component.selectProvider('earnings.provider', 'finnhub');
    expect(repo.set).toHaveBeenCalledWith('earnings.provider', 'finnhub');
  });

  it('shows the sector dependency hint on Twelve Data card when Finnhub key is unset', () => {
    // Audit 2026-05-06 finding #4 : the sector benchmark routes to Finnhub even in market
    // mode `twelvedata`, so a user who set their Twelve Data key but left Finnhub blank gets a
    // 503 on the Sector toggle without explanation. The hint is shown precisely in that gap —
    // when Finnhub.hasValue is false. The default fixture has FINN.hasValue = false, so the
    // hint should be rendered.
    const hint = fixture.nativeElement.querySelector('[data-testid="twelvedata-sector-hint"]');
    expect(hint).not.toBeNull();
  });

  it('hides the sector dependency hint once the Finnhub key is set', async () => {
    // Mirror of the previous test : when the user has a Finnhub key set, the hint is no longer
    // actionable and would just be noise. We re-load the entries with FINN.hasValue=true.
    repo.list.mockReturnValueOnce(
      of([
        TTL,
        { ...FINN, hasValue: true, isOverridden: true },
        MARKET_PROVIDER,
        TWELVE,
        NEWS_PROVIDER,
        ANALYST_PROVIDER,
        EARNINGS_PROVIDER,
        LLM_PROVIDER,
        OLLAMA_MODEL,
        ANTHROPIC_MODEL,
      ]),
    );
    component.load();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const hint = fixture.nativeElement.querySelector('[data-testid="twelvedata-sector-hint"]');
    expect(hint).toBeNull();
  });

  it('primes the LLM model inputs from the server values on load', () => {
    // Same rationale as the TTL slider — the input must show the saved value, not blank.
    // Otherwise a user who clicks Save without typing would either get a 400 (blank rejected) or
    // worse, replace a known-good config with the empty string before the validator catches it.
    expect(component.editValue('ollama.model')).toBe('qwen2.5:3b');
    expect(component.editValue('anthropic.api.model')).toBe('claude-opus-4-6');
  });

  it('modelDirty is false when the typed value equals the saved value', () => {
    // Save button gating mirrors ttlDirty — re-saving an unchanged model name would be a no-op
    // DB write that the user can't visually distinguish from a real save.
    expect(component.modelDirty('ollama.model')).toBe(false);
  });

  it('modelDirty becomes true after the input changes', () => {
    component.onInput('ollama.model', 'qwen2.5:7b');
    expect(component.modelDirty('ollama.model')).toBe(true);
  });

  it('testLlmModel routes to the ollama provider for the ollama key', () => {
    // The card the user clicked dictates the probed provider — independent from the currently
    // active llm.provider. The user is asking "does qwen2.5:7b work ?", not "is the live stack
    // working ?".
    component.onInput('ollama.model', 'qwen2.5:7b');
    component.testLlmModel('ollama.model');

    expect(repo.testLlm).toHaveBeenCalledWith('ollama', 'qwen2.5:7b');
  });

  it('testLlmModel routes to the claude provider for the anthropic key', () => {
    component.onInput('anthropic.api.model', 'claude-sonnet-4-5');
    component.testLlmModel('anthropic.api.model');

    expect(repo.testLlm).toHaveBeenCalledWith('claude', 'claude-sonnet-4-5');
  });

  // ----------------------------------------------------------------------- sub-sidenav sections

  it('defaults to the providers section on first load', () => {
    // Empty localStorage in beforeEach — the page lands on "providers" (the historical default
    // before the sub-nav was introduced, kept so existing users see the same first screen).
    expect(component.activeSection()).toBe('providers');
  });

  it('setSection flips the active section signal and persists to localStorage', () => {
    component.setSection('llm');

    expect(component.activeSection()).toBe('llm');
    expect(localStorage.getItem('runtime-config-section')).toBe('llm');
  });

  it('setSection is a no-op when the same section is already active', () => {
    // Avoids a redundant localStorage write on a re-click of the active button. Cheap, but the
    // pattern matches selectProvider's "no-op on unchanged value" — keeps the contracts uniform
    // across the page.
    const setItemSpy = vi.spyOn(localStorage, 'setItem');

    component.setSection('providers');

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it('hydrates the active section from localStorage on init', async () => {
    // Simulate a returning user who left the page on the LLM section. The fresh component picks
    // up the saved section without flickering through the default first.
    localStorage.setItem('runtime-config-section', 'llm');

    const fresh = TestBed.createComponent(Configuration);
    fresh.detectChanges();
    await fresh.whenStable();

    expect(fresh.componentInstance.activeSection()).toBe('llm');
  });

  // ----------------------------------------------------------------------- LLM timeout slider

  it('primes the LLM timeout slider from the server value', () => {
    // Mirror of the cache-TTL prime — without this, the slider would default to 400 s (the
    // service constant) on a stack where the saved value is 600 s, and a user who clicks Save
    // without dragging would silently overwrite the override.
    expect(component.llmTimeoutValue()).toBe(600);
    expect(component.llmTimeoutMinutes()).toBe(10); // 600 s / 60
  });

  it('llmTimeoutDirty is false when the slider equals the saved value', () => {
    expect(component.llmTimeoutDirty()).toBe(false);
  });

  it('llmTimeoutDirty becomes true after the slider moves', () => {
    component.onLlmTimeoutChange(720); // 12 min
    expect(component.llmTimeoutValue()).toBe(720);
    expect(component.llmTimeoutDirty()).toBe(true);
  });

  it('saving the LLM timeout calls LlmTimeoutService.refresh', () => {
    // The "estimation max" label on the LLM card reads its value from LlmTimeoutService — a save
    // that didn't refresh the service would leave the label showing the stale boot-time value
    // until the user reloaded the page, which is exactly what the inline refresh prevents.
    component.onLlmTimeoutChange(720);
    component.save('llm.timeout-seconds');

    expect(repo.set).toHaveBeenCalledWith('llm.timeout-seconds', '720');
    expect(timeoutServiceMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('saving an unrelated key does not refresh the LlmTimeoutService', () => {
    // Defensive : refresh() should fire only on llm.timeout-seconds. A blanket refresh on every
    // save would burn a /api/config round-trip per provider toggle for no reason.
    component.onTtlChange(45);
    component.save('market.cache.ttl-minutes');

    expect(timeoutServiceMock.refresh).not.toHaveBeenCalled();
  });

  it('renders the Twelve Data card only on the providers section', () => {
    // Default section "providers" — the dependency hint inside the Twelve Data card is the
    // canonical proof that the card is in the DOM.
    expect(
      fixture.nativeElement.querySelector('[data-testid="twelvedata-sector-hint"]'),
    ).not.toBeNull();

    component.setSection('llm');
    fixture.detectChanges();

    // After the switch the providers cards are detached — the hint goes with them.
    expect(
      fixture.nativeElement.querySelector('[data-testid="twelvedata-sector-hint"]'),
    ).toBeNull();
  });

  describe('Ollama status panel visibility', () => {
    it('renders the panel on the LLM section when llm.provider is ollama', () => {
      // The fixture seed has LLM_PROVIDER.currentValue = 'ollama' — switching to the LLM section
      // is enough to mount the panel. We don't read the panel's internals here ; that's the job
      // of ollama-status-panel.spec.ts.
      expect(component.isOllamaActive()).toBe(true);

      component.setSection('llm');
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('[data-testid="ollama-status-panel"]'),
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="claude-not-applicable"]'),
      ).toBeNull();
    });

    it('renders the not-applicable note instead of the panel when llm.provider is claude', () => {
      // Flip via selectProvider but pin the wire response to a properly-typed ENUM entry — the
      // generic `repo.set` mock copies from a SECRET fixture, which would land an ill-typed
      // entry in the signal and break the LLM provider card's render alongside this assertion.
      repo.set.mockImplementationOnce((_key: string, value: string) =>
        of({ ...LLM_PROVIDER, currentValue: value, isOverridden: value !== 'claude' }),
      );
      component.selectProvider('llm.provider', 'claude');
      fixture.detectChanges();

      expect(component.isOllamaActive()).toBe(false);

      component.setSection('llm');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="ollama-status-panel"]')).toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="claude-not-applicable"]'),
      ).not.toBeNull();
    });
  });
});
