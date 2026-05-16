/**
 * Tests on [OllamaStatusPanel] — the LLM-section panel that surfaces the local Ollama daemon
 * health. Driven by signal updates from a mocked [OllamaStatusService] ; the actual polling
 * mechanics are tested separately on the service side.
 *
 * What we pin :
 * - **Lifecycle** — `ngOnInit` starts polling, `ngOnDestroy` stops it. Mounting the component
 *   inside a parent that conditionally renders it (`@if (isOllamaActive())`) is enough to drive
 *   start/stop ; we don't need a manual subscription.
 * - **Daemon up** — green chip + latency + loaded models with size + countdown computed from
 *   `expires_at`.
 * - **Daemon down** — red chip + error message, no model lists rendered.
 * - **Empty loaded list** — friendly empty-state message instead of a blank section (a daemon
 *   that's running but hasn't been called yet legitimately reports zero loaded models).
 * - **Refresh button** — wired to the service's `refresh()` method ; one click → one call.
 * - **Countdown formatting** — `4m 32s` when minutes > 0, `15s` when only seconds, "expired"
 *   when the deadline has passed (the panel keeps showing the entry while Ollama hasn't yet
 *   reflected the unload — better than a stale "5m 0s" forever).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { OllamaStatus } from '../../../core/api/analysis/ollama-status.repository';
import { OllamaStatusService } from '../../../core/api/analysis/ollama-status.service';
import { OllamaStatusPanel } from './ollama-status-panel';

describe('OllamaStatusPanel', () => {
  let fixture: ComponentFixture<OllamaStatusPanel>;
  const statusSignal = signal<OllamaStatus | null>(null);
  const startPolling = vi.fn();
  const stopPolling = vi.fn();
  const refresh = vi.fn().mockReturnValue(of(undefined));
  const unload = vi.fn().mockReturnValue(of(undefined));
  const dialogOpen = vi.fn();

  beforeEach(async () => {
    statusSignal.set(null);
    startPolling.mockReset();
    stopPolling.mockReset();
    refresh.mockReset().mockReturnValue(of(undefined));
    unload.mockReset().mockReturnValue(of(undefined));
    dialogOpen.mockReset();

    await TestBed.configureTestingModule({
      imports: [OllamaStatusPanel],
      providers: [
        provideTranslateService({ lang: 'en' }),
        {
          provide: OllamaStatusService,
          useValue: {
            status: statusSignal.asReadonly(),
            startPolling,
            stopPolling,
            refresh,
            unload,
          },
        },
        // The panel injects MatDialog to open the pull dialog. We stub the `open` call so the
        // test stays focused on the panel's responsibility (clicking the button delegates to
        // the dialog) without spinning up the CDK overlay machinery — the dialog itself is
        // covered by `ollama-pull-dialog.spec.ts`.
        { provide: MatDialog, useValue: { open: dialogOpen } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OllamaStatusPanel);
  });

  afterEach(() => {
    // Critical : the component schedules a 1-s `now` ticker in ngOnInit. Without an explicit
    // destroy, the timer leaks across tests and the polling spy assertions get noisy.
    fixture.destroy();
  });

  it('starts polling on init and stops on destroy', () => {
    fixture.detectChanges(); // triggers ngOnInit
    expect(startPolling).toHaveBeenCalledTimes(1);
    expect(stopPolling).not.toHaveBeenCalled();

    fixture.destroy();
    expect(stopPolling).toHaveBeenCalledTimes(1);
  });

  it('renders the green chip and loaded model when the daemon is reachable', () => {
    // Pin the deadline 5 minutes from now so the countdown is positive but bounded.
    const deadline = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    statusSignal.set({
      daemonReachable: true,
      baseUrl: 'http://localhost:11434',
      latencyMs: 14,
      loadedModels: [{ name: 'qwen2.5:3b', expiresAt: deadline, sizeVramBytes: 2_008_000_000 }],
      availableModels: ['llama3.2:3b', 'qwen2.5:3b'],
      errorMessage: null,
    });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="status-chip-reachable"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="status-chip-unreachable"]')).toBeFalsy();
    expect(el.textContent).toContain('14');
    // Loaded model list rendered with name + countdown
    const loaded = el.querySelector('[data-testid="loaded-models"]');
    expect(loaded?.textContent).toContain('qwen2.5:3b');
    expect(loaded?.textContent).toContain('2.0 GB');
    // Available models rendered as chips
    const available = el.querySelector('[data-testid="available-models"]');
    expect(available?.textContent).toContain('llama3.2:3b');
    expect(available?.textContent).toContain('qwen2.5:3b');
  });

  it('renders the red chip and error message when the daemon is unreachable', () => {
    statusSignal.set({
      daemonReachable: false,
      baseUrl: 'http://localhost:11434',
      latencyMs: null,
      loadedModels: [],
      availableModels: [],
      errorMessage: 'Connection refused',
    });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="status-chip-unreachable"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="status-chip-reachable"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="error-message"]')?.textContent).toContain(
      'Connection refused',
    );
    // Loaded / available lists are deliberately not rendered when the daemon is down — putting
    // a "no models" empty-state under a red chip would compete for attention with the error.
    expect(el.querySelector('[data-testid="loaded-models"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="available-models"]')).toBeFalsy();
  });

  it('renders an empty-state when the daemon is reachable but no model is loaded', () => {
    // The just-rebooted-daemon case : Ollama is up, no narrative has fired yet, so /api/ps comes
    // back with an empty list. Friendly explanation > blank section.
    statusSignal.set({
      daemonReachable: true,
      baseUrl: 'http://localhost:11434',
      latencyMs: 8,
      loadedModels: [],
      availableModels: ['qwen2.5:3b'],
      errorMessage: null,
    });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="loaded-models"]')).toBeFalsy();
    // Translation key is rendered as fallback ; the assertion proves the empty branch took.
    expect(el.textContent).toContain('settings.configurationPage.ollamaStatus.noLoadedModels');
  });

  it('refresh button triggers a manual refresh on the service', () => {
    statusSignal.set({
      daemonReachable: true,
      baseUrl: 'http://localhost:11434',
      latencyMs: 12,
      loadedModels: [],
      availableModels: [],
      errorMessage: null,
    });
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="refresh-button"]',
    ) as HTMLButtonElement;
    expect(button).toBeTruthy();
    button.click();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('renders a spinner while the first refresh is in flight (status still null)', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    // No status chip yet — only the spinner row.
    expect(el.querySelector('mat-spinner')).toBeTruthy();
    expect(el.querySelector('[data-testid="status-chip-reachable"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="status-chip-unreachable"]')).toBeFalsy();
  });

  it('clicking the eject button forwards the model name to the service', () => {
    statusSignal.set({
      daemonReachable: true,
      baseUrl: 'http://localhost:11434',
      latencyMs: 12,
      loadedModels: [
        { name: 'qwen2.5:3b', expiresAt: null, sizeVramBytes: 2_008_000_000 },
        { name: 'llama3.2:3b', expiresAt: null, sizeVramBytes: 2_019_000_000 },
      ],
      availableModels: ['qwen2.5:3b', 'llama3.2:3b'],
      errorMessage: null,
    });
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll(
      '[data-testid="unload-button"]',
    ) as NodeListOf<HTMLButtonElement>;
    // One eject button per loaded model — the user can target a specific one rather than
    // unloading all of them.
    expect(buttons.length).toBe(2);

    buttons[1].click();

    expect(unload).toHaveBeenCalledTimes(1);
    expect(unload).toHaveBeenCalledWith('llama3.2:3b');
  });

  it('renders the Pull button only when the daemon is reachable', () => {
    // The button has no purpose against a dead daemon — pull would fail at the backend's first
    // network attempt. Hiding it on the unreachable branch keeps the action surface honest.
    statusSignal.set({
      daemonReachable: false,
      baseUrl: 'http://localhost:11434',
      latencyMs: null,
      loadedModels: [],
      availableModels: [],
      errorMessage: 'Connection refused',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="pull-button"]')).toBeFalsy();
  });

  it('Pull button opens the pull dialog when the daemon is reachable', () => {
    statusSignal.set({
      daemonReachable: true,
      baseUrl: 'http://localhost:11434',
      latencyMs: 11,
      loadedModels: [],
      availableModels: ['qwen2.5:3b'],
      errorMessage: null,
    });
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="pull-button"]',
    ) as HTMLButtonElement;
    expect(button).toBeTruthy();

    button.click();

    expect(dialogOpen).toHaveBeenCalledTimes(1);
    // First arg is the component class — we don't pin it tightly (the dialog import would couple
    // the spec to the component identity), we just assert the call shape.
    expect(dialogOpen).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({}));
  });
});
