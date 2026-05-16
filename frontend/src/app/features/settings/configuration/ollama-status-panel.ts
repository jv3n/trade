import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { OllamaStatusService } from '../../../core/ollama-status.service';
import { OllamaPullDialog } from './ollama-pull-dialog';

/**
 * Panel rendered at the top of the LLM section of `/settings/configuration` when
 * `llm.provider === 'ollama'`. Surfaces the daemon health (up/down + latency), models pulled
 * locally, and models currently held in VRAM with their idle-timeout countdown.
 *
 * Why a dedicated panel rather than a few inline lines on the LLM provider card : the user who
 * runs Ollama wants this information visible whenever they touch the LLM settings, and they want
 * it to update live (the model unloads from VRAM after 5 min of idle, the loaded list shifts when
 * a narrative kicks in, etc.). A polling component justifies its own scope ; folding it into the
 * provider toggle would mix concerns and complicate the test surface.
 *
 * **Lifecycle** : starts polling in `ngOnInit`, stops in `ngOnDestroy`. The parent
 * `Configuration` page only mounts this component when the user is on the LLM section, so the
 * `*ngIf` natural lifecycle is enough — no need to wire `activeSection` tracking.
 *
 * **Countdown** : the `expires_at` field comes from the backend as an ISO instant. We tick a local
 * `now` signal every second to keep the displayed `4m 32s` value accurate without re-fetching the
 * status. The actual data refresh happens on the slower 10-s polling interval.
 */
@Component({
  selector: 'app-ollama-status-panel',
  standalone: true,
  imports: [
    TranslatePipe,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './ollama-status-panel.html',
  styleUrl: './ollama-status-panel.scss',
})
export class OllamaStatusPanel implements OnInit, OnDestroy {
  private readonly statusService = inject(OllamaStatusService);
  private readonly translate = inject(TranslateService);
  private readonly dialog = inject(MatDialog);

  readonly status = this.statusService.status;

  /** Local time tick — used solely for the countdown computation, refreshed every second. */
  private readonly now = signal(Date.now());
  private nowHandle: ReturnType<typeof setInterval> | null = null;

  /** True while the very first refresh is in flight ; the panel renders a spinner instead of stale chips. */
  readonly isFirstLoad = computed(() => this.status() === null);

  /** Loaded models with their countdown pre-formatted in a single render pass. */
  readonly loadedModelViews = computed(() => {
    const snap = this.status();
    if (!snap) return [];
    const currentNow = this.now();
    return snap.loadedModels.map((m) => ({
      ...m,
      countdown: formatCountdown(m.expiresAt, currentNow, this.translate),
      sizeHuman: formatSize(m.sizeVramBytes),
    }));
  });

  ngOnInit(): void {
    this.statusService.startPolling();
    this.nowHandle = setInterval(() => {
      this.now.set(Date.now());
    }, NOW_TICK_MS);
  }

  ngOnDestroy(): void {
    this.statusService.stopPolling();
    if (this.nowHandle !== null) {
      clearInterval(this.nowHandle);
      this.nowHandle = null;
    }
  }

  refresh(): void {
    this.statusService.refresh().subscribe();
  }

  unload(model: string): void {
    this.statusService.unload(model).subscribe();
  }

  openPullDialog(): void {
    this.dialog.open(OllamaPullDialog, { width: '420px', autoFocus: 'first-tabbable' });
  }
}

const NOW_TICK_MS = 1_000;

function formatCountdown(
  expiresAt: string | null,
  now: number,
  translate: TranslateService,
): string | null {
  if (!expiresAt) return null;
  const deadline = Date.parse(expiresAt);
  if (Number.isNaN(deadline)) return null;
  const remainingMs = deadline - now;
  if (remainingMs <= 0) return translate.instant('settings.configurationPage.ollamaStatus.expired');
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const value = minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
  return translate.instant('settings.configurationPage.ollamaStatus.expiresIn', { value });
}

function formatSize(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null;
  const gb = bytes / 1_000_000_000;
  return `${gb.toFixed(1)} GB`;
}
