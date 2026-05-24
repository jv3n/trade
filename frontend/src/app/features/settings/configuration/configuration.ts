import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSliderModule } from '@angular/material/slider';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ConfigEntry,
  ConfigRepository,
  TestConfigResult,
} from '../../../core/api/config/config.repository';
import { LlmTimeoutService } from '../../../core/api/analysis/llm-timeout.service';
import { OllamaStatusPanel } from './ollama-status-panel';

const TWELVE_DATA_KEY = 'market.twelvedata.api-key';
const FINNHUB_KEY = 'market.finnhub.api-key';
const ANTHROPIC_KEY = 'anthropic.api.key';
const CACHE_TTL_KEY = 'market.cache.ttl-minutes';
const MARKET_PROVIDER_KEY = 'market.provider';
const NEWS_PROVIDER_KEY = 'news.provider';
const ANALYST_PROVIDER_KEY = 'analyst.provider';
const EARNINGS_PROVIDER_KEY = 'earnings.provider';
const LLM_PROVIDER_KEY = 'llm.provider';
const OLLAMA_MODEL_KEY = 'ollama.model';
const ANTHROPIC_MODEL_KEY = 'anthropic.api.model';
const LLM_TIMEOUT_KEY = 'llm.timeout-seconds';

const SECONDS_PER_MINUTE = 60;

const PROVIDER_OLLAMA = 'ollama';
const PROVIDER_CLAUDE = 'claude';

type ConfigSection = 'providers' | 'llm';

const SECTION_STORAGE_KEY = 'runtime-config-section';

/**
 * Suggested model names for the autocomplete. The Ollama list reflects the models we've actually
 * iterated on (qwen2.5:3b is the Phase 1 default, the rest are reasonable candidates for a
 * stronger machine). The Claude list mirrors what the Anthropic SDK accepts today. Both lists are
 * **suggestions** : the input accepts any string, the backend doesn't whitelist either model key.
 */
const OLLAMA_MODEL_SUGGESTIONS = [
  'qwen2.5:3b',
  'qwen2.5:7b',
  'llama3.2:3b',
  'llama3.1:8b',
  'mistral:7b',
  'phi4-mini',
];
const CLAUDE_MODEL_SUGGESTIONS = [
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-haiku-4-5-20251001',
];

/**
 * Settings page for runtime-editable configuration. Lists every key exposed by the backend split
 * across two sub-sections behind an in-page sidenav :
 * - **Providers de données** : market / news / analyst / earnings provider toggles + Twelve Data
 *   and Finnhub API keys + market cache TTL.
 * - **LLM** : llm provider toggle (claude ↔ ollama) + Ollama model + Claude model.
 * The sub-sidenav uses [activeSection] (signal, localStorage-persisted) rather than child routes
 * — single-user app, the URL share-ability isn't worth a second route + redirect.
 *
 * **Per-key state** — `edits` holds the in-progress typed value, `saving` tracks which keys are
 * mid-save, `testing` which keys are mid-test, `testResults` the last result of the "Tester"
 * button. All four are signals indexed by config key, so multiple cards can be edited
 * independently without their state bleeding into each other.
 *
 * **Secrets** — the backend never sends the actual API key value back, so the input always starts
 * empty and the UI shows "Set / Not set" via `entry.hasValue`. Saving an empty input is rejected
 * by the backend (use Reset to clear).
 */
@Component({
  selector: 'app-configuration',
  imports: [
    CommonModule,
    FormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSliderModule,
    MatButtonToggleModule,
    MatTooltipModule,
    TranslatePipe,
    OllamaStatusPanel,
  ],
  templateUrl: './configuration.html',
  styleUrl: './configuration.scss',
})
export class Configuration implements OnInit {
  private readonly repo = inject(ConfigRepository);
  private readonly translate = inject(TranslateService);
  private readonly timeoutService = inject(LlmTimeoutService);

  loading = signal(true);
  loadError = signal<string | null>(null);
  entries = signal<ConfigEntry[]>([]);

  /**
   * Active sub-section of the page. The same `Configuration` component renders both, gated by a
   * signal rather than a child route — single-user app, the URL share-ability isn't worth a
   * second route + redirect. Persisted to localStorage so a user who tweaked the LLM card and
   * navigated away lands back on the same section next time.
   */
  activeSection = signal<ConfigSection>(this.loadSection());

  private edits = signal<Record<string, string>>({});
  private saving = signal<Set<string>>(new Set());
  private testing = signal<Set<string>>(new Set());
  testResults = signal<Record<string, TestConfigResult>>({});
  saveErrors = signal<Record<string, string>>({});

  twelveData = computed(() => this.entries().find((e) => e.key === TWELVE_DATA_KEY));
  finnhub = computed(() => this.entries().find((e) => e.key === FINNHUB_KEY));
  anthropicKey = computed(() => this.entries().find((e) => e.key === ANTHROPIC_KEY));
  cacheTtl = computed(() => this.entries().find((e) => e.key === CACHE_TTL_KEY));
  marketProvider = computed(() => this.entries().find((e) => e.key === MARKET_PROVIDER_KEY));
  newsProvider = computed(() => this.entries().find((e) => e.key === NEWS_PROVIDER_KEY));
  analystProvider = computed(() => this.entries().find((e) => e.key === ANALYST_PROVIDER_KEY));
  earningsProvider = computed(() => this.entries().find((e) => e.key === EARNINGS_PROVIDER_KEY));
  llmProvider = computed(() => this.entries().find((e) => e.key === LLM_PROVIDER_KEY));
  ollamaModel = computed(() => this.entries().find((e) => e.key === OLLAMA_MODEL_KEY));
  anthropicModel = computed(() => this.entries().find((e) => e.key === ANTHROPIC_MODEL_KEY));
  llmTimeout = computed(() => this.entries().find((e) => e.key === LLM_TIMEOUT_KEY));

  /**
   * Drives the Ollama status panel visibility — only renders when `llm.provider` is set to
   * `ollama`. The Claude provider has no daemon to surface (Anthropic API is remote) ; the
   * existing "Tester" button on the Claude model card is the right tool there.
   */
  isOllamaActive = computed(() => this.llmProvider()?.currentValue === 'ollama');

  readonly ollamaSuggestions = OLLAMA_MODEL_SUGGESTIONS;
  readonly claudeSuggestions = CLAUDE_MODEL_SUGGESTIONS;

  /** True when the slider value differs from the saved value — disables the Save button otherwise. */
  ttlDirty = computed(() => {
    const ttl = this.cacheTtl();
    if (!ttl?.currentValue) return false;
    return this.ttlValue() !== Number(ttl.currentValue);
  });

  /** Same dirty contract as [ttlDirty] but for the LLM timeout slider. */
  llmTimeoutDirty = computed(() => {
    const entry = this.llmTimeout();
    if (!entry?.currentValue) return false;
    return this.llmTimeoutValue() !== Number(entry.currentValue);
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.loadError.set(null);
    this.repo.list().subscribe({
      next: (list) => {
        this.entries.set(list);
        this.loading.set(false);
        // Prime the TTL edit state and the LLM model inputs from the server values so the
        // controls start showing the saved value (otherwise the user would see a blank input
        // and assume nothing was set, then accidentally save a blank).
        const ttl = list.find((e) => e.key === CACHE_TTL_KEY);
        if (ttl?.currentValue) {
          this.edits.update((m) => ({ ...m, [CACHE_TTL_KEY]: ttl.currentValue! }));
        }
        for (const key of [OLLAMA_MODEL_KEY, ANTHROPIC_MODEL_KEY]) {
          const entry = list.find((e) => e.key === key);
          if (entry?.currentValue) {
            this.edits.update((m) => ({ ...m, [key]: entry.currentValue! }));
          }
        }
        const timeout = list.find((e) => e.key === LLM_TIMEOUT_KEY);
        if (timeout?.currentValue) {
          this.edits.update((m) => ({ ...m, [LLM_TIMEOUT_KEY]: timeout.currentValue! }));
        }
      },
      error: () => {
        this.loadError.set(this.translate.instant('settings.configurationPage.errors.load'));
        this.loading.set(false);
      },
    });
  }

  /**
   * True when the typed model name differs from the saved value — the Save button mirrors the
   * TTL slider's "dirty" gating so a re-click on an unchanged value doesn't fire a write.
   */
  modelDirty(key: string): boolean {
    const entry = this.entries().find((e) => e.key === key);
    if (!entry) return false;
    const typed = (this.edits()[key] ?? '').trim();
    if (!typed) return false;
    return typed !== (entry.currentValue ?? '');
  }

  editValue(key: string): string {
    return this.edits()[key] ?? '';
  }

  ttlValue(): number {
    const fromEdit = this.edits()[CACHE_TTL_KEY];
    if (fromEdit) return Number(fromEdit);
    const fromServer = this.cacheTtl()?.currentValue;
    return fromServer ? Number(fromServer) : 15;
  }

  llmTimeoutValue(): number {
    const fromEdit = this.edits()[LLM_TIMEOUT_KEY];
    if (fromEdit) return Number(fromEdit);
    const fromServer = this.llmTimeout()?.currentValue;
    return fromServer ? Number(fromServer) : 400;
  }

  /** The slider stores seconds ; the label reads better in minutes. */
  llmTimeoutMinutes(): number {
    return Math.round(this.llmTimeoutValue() / SECONDS_PER_MINUTE);
  }

  llmTimeoutDefaultMinutes(): number {
    const entry = this.llmTimeout();
    if (!entry?.defaultValue) return 0;
    return Math.round(Number(entry.defaultValue) / SECONDS_PER_MINUTE);
  }

  isSaving(key: string): boolean {
    return this.saving().has(key);
  }

  isTesting(key: string): boolean {
    return this.testing().has(key);
  }

  onInput(key: string, value: string) {
    this.edits.update((m) => ({ ...m, [key]: value }));
    // A fresh edit invalidates the previous test result — the user might have changed the key
    // between clicking Tester and clicking Sauver.
    this.testResults.update((m) => {
      const next = { ...m };
      delete next[key];
      return next;
    });
  }

  onTtlChange(value: number) {
    this.edits.update((m) => ({ ...m, [CACHE_TTL_KEY]: String(value) }));
  }

  onLlmTimeoutChange(value: number) {
    this.edits.update((m) => ({ ...m, [LLM_TIMEOUT_KEY]: String(value) }));
  }

  save(key: string) {
    const value = (this.edits()[key] ?? '').trim();
    if (!value || this.isSaving(key)) return;
    this.markSaving(key, true);
    this.saveErrors.update((m) => {
      const next = { ...m };
      delete next[key];
      return next;
    });

    this.repo.set(key, value).subscribe({
      next: (updated) => {
        const isSecret = key === TWELVE_DATA_KEY || key === FINNHUB_KEY || key === ANTHROPIC_KEY;
        if (isSecret) {
          // Saving a SECRET flips `disabledReason` on **dependent provider toggles** server-side
          // (e.g. saving the Finnhub key un-disables `news.provider=finnhub`,
          // `analyst.provider=finnhub`, `earnings.provider=finnhub` at once). Refetch the full
          // list to pick up the new annotations rather than trying to mirror the gating mapping
          // on the client — the source of truth lives in `ConfigKeys.PROVIDER_REQUIRED_KEY`. The
          // reset() path already does this for the inverse direction (clearing a SECRET
          // re-disables the toggles).
          this.repo.list().subscribe({
            next: (list) => {
              this.entries.set(list);
              this.markSaving(key, false);
              // Blank the input — the saved value is now masked, no need to leave the typed
              // key on screen.
              this.edits.update((m) => ({ ...m, [key]: '' }));
            },
            error: () => this.markSaving(key, false),
          });
          return;
        }
        this.entries.update((list) => list.map((e) => (e.key === key ? updated : e)));
        this.markSaving(key, false);
        // Saving the LLM timeout updates the value [LlmTimeoutService] surfaces to the
        // "estimation max" label on this same LLM card — refresh it so the label reflects the
        // new slider position immediately, without a page reload. `refresh()` is a cold
        // Observable since `22fa6f5` — without `.subscribe()` it would no-op.
        if (key === LLM_TIMEOUT_KEY) this.timeoutService.refresh().subscribe();
      },
      error: (err) => {
        const detail =
          err?.error?.error ?? this.translate.instant('settings.configurationPage.errors.save');
        this.saveErrors.update((m) => ({ ...m, [key]: detail }));
        this.markSaving(key, false);
      },
    });
  }

  reset(key: string) {
    if (this.isSaving(key)) return;
    this.markSaving(key, true);
    this.saveErrors.update((m) => {
      const next = { ...m };
      delete next[key];
      return next;
    });

    this.repo.reset(key).subscribe({
      next: () => {
        // Re-fetch the list so currentValue / isOverridden are in sync with the server's view of
        // "default" (avoids guessing the default value client-side).
        this.repo.list().subscribe({
          next: (list) => {
            this.entries.set(list);
            this.markSaving(key, false);
            this.edits.update((m) => {
              const next = { ...m };
              delete next[key];
              return next;
            });
            // Mirror the save() branch — a reset on the LLM timeout flips the value the
            // "estimation max" label reads from [LlmTimeoutService]. `refresh()` cold Observable
            // since `22fa6f5` — `.subscribe()` is what actually fires it.
            if (key === LLM_TIMEOUT_KEY) this.timeoutService.refresh().subscribe();
          },
          error: () => this.markSaving(key, false),
        });
      },
      error: () => {
        this.saveErrors.update((m) => ({
          ...m,
          [key]: this.translate.instant('settings.configurationPage.errors.reset'),
        }));
        this.markSaving(key, false);
      },
    });
  }

  test(key: string) {
    const value = (this.edits()[key] ?? '').trim();
    if (!value || this.isTesting(key)) return;
    this.testing.update((s) => new Set([...s, key]));
    this.testResults.update((m) => {
      const next = { ...m };
      delete next[key];
      return next;
    });

    const probe$ =
      key === TWELVE_DATA_KEY
        ? this.repo.testTwelveData(value)
        : key === ANTHROPIC_KEY
          ? this.repo.testAnthropic(value)
          : this.repo.testFinnhub(value);
    probe$.subscribe({
      next: (result) => {
        this.testResults.update((m) => ({ ...m, [key]: result }));
        this.testing.update((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      },
      error: () => {
        this.testResults.update((m) => ({
          ...m,
          [key]: {
            ok: false,
            message: this.translate.instant('settings.configurationPage.errors.test'),
          },
        }));
        this.testing.update((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      },
    });
  }

  /**
   * Probe an LLM (provider, model) pair with the fixed "Reply with exactly the word OK." prompt.
   * The probe target is *always* the provider this card belongs to, regardless of the currently
   * active `llm.provider` — the user is asking "does this model answer when I switch ?", not "is
   * the active stack working ?". Result is keyed by the model's config key so the green/red
   * banner renders under the right card.
   */
  testLlmModel(key: string) {
    const value = (this.edits()[key] ?? '').trim();
    if (!value || this.isTesting(key)) return;
    const provider = key === OLLAMA_MODEL_KEY ? PROVIDER_OLLAMA : PROVIDER_CLAUDE;
    this.testing.update((s) => new Set([...s, key]));
    this.testResults.update((m) => {
      const next = { ...m };
      delete next[key];
      return next;
    });

    this.repo.testLlm(provider, value).subscribe({
      next: (result) => {
        this.testResults.update((m) => ({ ...m, [key]: result }));
        this.testing.update((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      },
      error: () => {
        this.testResults.update((m) => ({
          ...m,
          [key]: {
            ok: false,
            message: this.translate.instant('settings.configurationPage.errors.test'),
          },
        }));
        this.testing.update((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      },
    });
  }

  /**
   * Switch a provider. Unlike the secret keys (which require typing + an explicit Save), the
   * provider toggles save instantly on click — that's the whole point of the toggle UX. The next
   * ticker dossier load lands on the new adapter ; if the user picked a real provider without a
   * key set, they'll see a 503 with a clear message and can flip back here.
   */
  selectProvider(key: string, value: string) {
    if (this.isSaving(key)) return;
    const current = this.entries().find((e) => e.key === key)?.currentValue;
    if (current === value) return;
    this.markSaving(key, true);
    this.saveErrors.update((m) => {
      const next = { ...m };
      delete next[key];
      return next;
    });

    this.repo.set(key, value).subscribe({
      next: (updated) => {
        this.entries.update((list) => list.map((e) => (e.key === key ? updated : e)));
        this.markSaving(key, false);
      },
      error: (err) => {
        const detail =
          err?.error?.error ?? this.translate.instant('settings.configurationPage.errors.save');
        this.saveErrors.update((m) => ({ ...m, [key]: detail }));
        this.markSaving(key, false);
      },
    });
  }

  setSection(section: ConfigSection) {
    if (this.activeSection() === section) return;
    this.activeSection.set(section);
    try {
      localStorage.setItem(SECTION_STORAGE_KEY, section);
    } catch {
      // localStorage may throw in private mode or if quota is exceeded — degrade silently,
      // the signal still drives the in-memory section, only the persistence is lost.
    }
  }

  private loadSection(): ConfigSection {
    try {
      return localStorage.getItem(SECTION_STORAGE_KEY) === 'llm' ? 'llm' : 'providers';
    } catch {
      return 'providers';
    }
  }

  private markSaving(key: string, on: boolean) {
    this.saving.update((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });
  }
}
