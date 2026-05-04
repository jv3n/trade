import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSliderModule } from '@angular/material/slider';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfigEntry, ConfigRepository, TestConfigResult } from '../../../core/config.repository';

const TWELVE_DATA_KEY = 'market.twelvedata.api-key';
const FINNHUB_KEY = 'market.finnhub.api-key';
const CACHE_TTL_KEY = 'market.cache.ttl-minutes';
const MARKET_PROVIDER_KEY = 'market.provider';
const NEWS_PROVIDER_KEY = 'news.provider';

/**
 * Settings page for runtime-editable configuration. Lists the three keys exposed by the backend
 * (Twelve Data API key, Finnhub API key, market cache TTL) and lets the user edit each one
 * without rebooting the backend.
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
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSliderModule,
    MatButtonToggleModule,
    TranslatePipe,
  ],
  templateUrl: './configuration.html',
  styleUrl: './configuration.scss',
})
export class Configuration implements OnInit {
  private readonly repo = inject(ConfigRepository);
  private readonly translate = inject(TranslateService);

  loading = signal(true);
  loadError = signal<string | null>(null);
  entries = signal<ConfigEntry[]>([]);

  private edits = signal<Record<string, string>>({});
  private saving = signal<Set<string>>(new Set());
  private testing = signal<Set<string>>(new Set());
  testResults = signal<Record<string, TestConfigResult>>({});
  saveErrors = signal<Record<string, string>>({});

  twelveData = computed(() => this.entries().find((e) => e.key === TWELVE_DATA_KEY));
  finnhub = computed(() => this.entries().find((e) => e.key === FINNHUB_KEY));
  cacheTtl = computed(() => this.entries().find((e) => e.key === CACHE_TTL_KEY));
  marketProvider = computed(() => this.entries().find((e) => e.key === MARKET_PROVIDER_KEY));
  newsProvider = computed(() => this.entries().find((e) => e.key === NEWS_PROVIDER_KEY));

  /** True when the slider value differs from the saved value — disables the Save button otherwise. */
  ttlDirty = computed(() => {
    const ttl = this.cacheTtl();
    if (!ttl?.currentValue) return false;
    return this.ttlValue() !== Number(ttl.currentValue);
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
        // Prime the TTL edit state from the server value so the slider starts in sync.
        const ttl = list.find((e) => e.key === CACHE_TTL_KEY);
        if (ttl?.currentValue) {
          this.edits.update((m) => ({ ...m, [CACHE_TTL_KEY]: ttl.currentValue! }));
        }
      },
      error: () => {
        this.loadError.set(this.translate.instant('settings.configurationPage.errors.load'));
        this.loading.set(false);
      },
    });
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
        this.entries.update((list) => list.map((e) => (e.key === key ? updated : e)));
        this.markSaving(key, false);
        // For secrets, blank the input back out — the saved value is now masked and we don't
        // want the typed key to linger on screen.
        if (key === TWELVE_DATA_KEY || key === FINNHUB_KEY) {
          this.edits.update((m) => ({ ...m, [key]: '' }));
        }
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
      key === TWELVE_DATA_KEY ? this.repo.testTwelveData(value) : this.repo.testFinnhub(value);
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

  private markSaving(key: string, on: boolean) {
    this.saving.update((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });
  }
}
