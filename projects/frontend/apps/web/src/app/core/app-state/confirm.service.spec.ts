/**
 * Tests on [ConfirmService] against the **real** design-system modal (`StbConfirmDialog` opened by
 * `StbConfirm` through `MatDialog`), so the contract every create / delete call site relies on is
 * pinned end to end :
 *
 * - **Texts come from the i18n key group** — `title` / `message` / `confirm` under the given key,
 *   interpolated with the params, and Cancel from `common.cancel`.
 * - **Only an explicit confirmation emits `true`** — Cancel and Esc both emit `false`, so the
 *   caller's `filter(Boolean)` never reaches the repository.
 * - **Danger variant** — deletions get the red confirm button (`stbDanger`) and the `delete` icon.
 *
 * Material animations are disabled so the dialog closes synchronously (jsdom never fires the
 * `animationend` a real close waits for).
 */
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { MatDialog, MATERIAL_ANIMATIONS } from '@portfolioai/ui';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmOptions, ConfirmService } from './confirm.service';

const EN = {
  common: { cancel: 'Cancel' },
  journal: {
    confirmDelete: {
      title: 'Delete the {{ticker}} trade?',
      message: 'Executions, post-mortem and chart capture are deleted.',
      confirm: 'Delete the trade',
    },
  },
};

function setup(): ConfirmService {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
    ],
  });
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('en', EN);
  translate.use('en');
  return TestBed.inject(ConfirmService);
}

async function settle(): Promise<void> {
  const appRef = TestBed.inject(ApplicationRef);
  appRef.tick();
  await appRef.whenStable();
}

/** Opens the modal and returns a live view on what the service emitted (empty = nothing yet). */
async function ask(service: ConfirmService, options: ConfirmOptions = {}) {
  const emitted: boolean[] = [];
  service.ask('journal.confirmDelete', options).subscribe((v) => emitted.push(v));
  await settle();
  return emitted;
}

function dialogEl(): HTMLElement {
  const el = document.querySelector<HTMLElement>('ui-confirm-dialog');
  if (!el) throw new Error('confirmation dialog not rendered');
  return el;
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(dialogEl().querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`button « ${label} » not found`);
  return found;
}

describe('ConfirmService', () => {
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('renders the title, message and buttons from the i18n key group with its params', async () => {
    const service = setup();
    await ask(service, { params: { ticker: 'KTTA' } });

    expect(dialogEl().querySelector('h2')?.textContent?.trim()).toBe('Delete the KTTA trade?');
    expect(dialogEl().textContent).toContain(
      'Executions, post-mortem and chart capture are deleted.',
    );
    expect(button('Cancel')).toBeTruthy();
    expect(button('Delete the trade')).toBeTruthy();
  });

  it('emits true when the user clicks the confirm button', async () => {
    const service = setup();
    const emitted = await ask(service, { params: { ticker: 'KTTA' } });

    button('Delete the trade').click();
    await settle();

    expect(emitted).toEqual([true]);
  });

  it('emits false when the user clicks Cancel', async () => {
    const service = setup();
    const emitted = await ask(service, { params: { ticker: 'KTTA' } });

    button('Cancel').click();
    await settle();

    expect(emitted).toEqual([false]);
  });

  it('emits false when the user presses Esc', async () => {
    const service = setup();
    const emitted = await ask(service, { params: { ticker: 'KTTA' } });

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
    );
    await settle();

    expect(emitted).toEqual([false]);
  });

  it('gives a deletion the red confirm button and the delete icon', async () => {
    const service = setup();
    await ask(service, { params: { ticker: 'KTTA' }, variant: 'danger' });

    expect(button('Delete the trade').classList).toContain('stb-button--danger');
    expect(dialogEl().querySelector('mat-icon')?.textContent?.trim()).toBe('delete');
  });

  it('keeps the accent confirm button and the help icon by default', async () => {
    const service = setup();
    await ask(service, { params: { ticker: 'KTTA' } });

    expect(button('Delete the trade').classList).not.toContain('stb-button--danger');
    expect(dialogEl().querySelector('mat-icon')?.textContent?.trim()).toBe('help');
  });
});
