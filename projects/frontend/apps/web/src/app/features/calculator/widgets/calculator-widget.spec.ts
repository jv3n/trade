import { Clipboard } from '@angular/cdk/clipboard';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeService } from '../../../core/app-state/theme.service';
import { SizeCard } from '../cards/size-card';
import { CalculatorWidget } from './calculator-widget';
import { CalculatorWidgets } from './calculator-widgets';

/**
 * One floating calculator (#421) : the page's card under a header that closes it — Escape too —
 * and detaches it into its own window where the browser can. Detached, the widget's element is
 * moved into that window with the theme, stays in view there when clicked, and comes back to the
 * page when the window closes.
 */
describe('CalculatorWidget', () => {
  const theme = signal<'dark' | 'light'>('dark');

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['documentPictureInPicture'];
    TestBed.resetTestingModule();
  });

  async function setup(): Promise<{
    fixture: ComponentFixture<CalculatorWidget>;
    widgets: CalculatorWidgets;
  }> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        { provide: Clipboard, useValue: { copy: vi.fn() } },
        { provide: ThemeService, useValue: { resolved: theme } },
      ],
    });
    const widgets = TestBed.inject(CalculatorWidgets);
    widgets.show('size');
    const fixture = TestBed.createComponent(CalculatorWidget);
    fixture.componentRef.setInput('widget', widgets.open()[0]);
    await fixture.whenStable();
    return { fixture, widgets };
  }

  const button = (fixture: ComponentFixture<CalculatorWidget>, label: string) =>
    fixture.nativeElement.querySelector(
      `button[aria-label="${label}"]`,
    ) as HTMLButtonElement | null;

  it('shows the calculator under a header named after it, with what it is for', async () => {
    const { fixture } = await setup();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');

    expect(dialog.getAttribute('aria-label')).toBe('calculator.size.title');
    expect(
      fixture.nativeElement.querySelector('.calc-widget__description').textContent.trim(),
    ).toBe('calculator.size.description');
    expect(fixture.debugElement.query((d) => d.componentInstance instanceof SizeCard)).toBeTruthy();
  });

  it('closes from its header, and on Escape', async () => {
    const { fixture, widgets } = await setup();

    button(fixture, 'calculator.widget.close')!.click();
    expect(widgets.isOpen('size')).toBe(false);

    widgets.show('size');
    fixture.componentRef.setInput('widget', widgets.open()[0]);
    fixture.nativeElement
      .querySelector('[role="dialog"]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(widgets.isOpen('size')).toBe(false);
  });

  it('offers no detach where the browser has no Picture-in-Picture window', async () => {
    const { fixture } = await setup();

    expect(button(fixture, 'calculator.widget.detach')).toBeNull();
  });

  /** A browser with Document Picture-in-Picture ; `pagehide()` closes the window it opens. */
  function givenPipWindow(): { pipDocument: Document; pagehide: () => void } {
    const pip = {
      pipDocument: document.implementation.createHTMLDocument('pip'),
      pagehide: () => undefined as void,
    };
    const pipWindow = {
      document: pip.pipDocument,
      close: vi.fn(),
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'pagehide') pip.pagehide = listener;
      },
    };
    (window as unknown as Record<string, unknown>)['documentPictureInPicture'] = {
      requestWindow: vi.fn(() => Promise.resolve(pipWindow)),
    };
    return pip;
  }

  it('moves into its own window with the theme, and back when that window closes', async () => {
    const pip = givenPipWindow();
    const { pipDocument } = pip;
    const { fixture } = await setup();
    const host = fixture.nativeElement as HTMLElement;
    const home = host.parentNode;

    button(fixture, 'calculator.widget.detach')!.click();
    await fixture.whenStable();

    expect(host.parentNode).toBe(pipDocument.body);
    expect(pipDocument.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(fixture.componentInstance.detached()).toBe(true);

    theme.set('light');
    await fixture.whenStable();
    expect(pipDocument.documentElement.getAttribute('data-theme')).toBe('light');

    pip.pagehide();
    await fixture.whenStable();
    expect(host.parentNode).toBe(home);
    expect(fixture.componentInstance.detached()).toBe(false);
  });

  // A click in the window brought the widget forward, and its page position then translated the
  // card out of the window : the window went blank, nothing left to click.
  it('stays in view in its own window when clicked', async () => {
    givenPipWindow();
    const { fixture, widgets } = await setup();
    const card = fixture.nativeElement.querySelector('.calc-widget') as HTMLElement;
    button(fixture, 'calculator.widget.detach')!.click();
    await fixture.whenStable();

    card.dispatchEvent(new Event('pointerdown'));
    fixture.componentRef.setInput('widget', widgets.open()[0]);
    await fixture.whenStable();

    expect(card.style.transform).toBe('translate3d(0px, 0px, 0)');
  });
});
