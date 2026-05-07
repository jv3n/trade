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
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { Configuration } from './configuration';
import { ConfigEntry, ConfigRepository } from '../../../core/config.repository';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

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

describe('Configuration', () => {
  let component: Configuration;
  let fixture: ComponentFixture<Configuration>;
  let repo: {
    list: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    testTwelveData: ReturnType<typeof vi.fn>;
    testFinnhub: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    repo = {
      list: vi
        .fn()
        .mockReturnValue(
          of([
            TTL,
            FINN,
            MARKET_PROVIDER,
            TWELVE,
            NEWS_PROVIDER,
            ANALYST_PROVIDER,
            EARNINGS_PROVIDER,
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
    };

    await TestBed.configureTestingModule({
      imports: [Configuration],
      providers: [
        provideTranslateService({ lang: 'en' }),
        provideAnimationsAsync(),
        { provide: ConfigRepository, useValue: repo },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Configuration);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('loads the entries on init', () => {
    expect(repo.list).toHaveBeenCalledTimes(1);
    expect(component.entries().length).toBe(7);
    expect(component.twelveData()?.key).toBe('market.twelvedata.api-key');
    expect(component.cacheTtl()?.currentValue).toBe('30');
    expect(component.marketProvider()?.allowedValues).toEqual(['mock', 'twelvedata']);
    expect(component.newsProvider()?.allowedValues).toEqual(['mock', 'finnhub']);
    expect(component.analystProvider()?.allowedValues).toEqual(['mock', 'finnhub']);
    expect(component.earningsProvider()?.allowedValues).toEqual(['mock', 'finnhub']);
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

    component.onInput('market.finnhub.api-key', 'fn-candidate');
    component.test('market.finnhub.api-key');
    expect(repo.testFinnhub).toHaveBeenCalledWith('fn-candidate');
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
      ]),
    );
    component.load();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const hint = fixture.nativeElement.querySelector('[data-testid="twelvedata-sector-hint"]');
    expect(hint).toBeNull();
  });
});
