import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import { ReportsPage } from './reports-page';

/**
 * The « Rapports » shell : one route per tab (#205), so a tab is a link — « Back » returns to it —
 * and the tab of the URL is the one lit.
 */
@Component({ template: '' })
class Tab {}

describe('ReportsPage', () => {
  async function at(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        provideRouter([
          {
            path: 'reports',
            component: ReportsPage,
            children: [
              { path: '', component: Tab },
              { path: 'rules', component: Tab },
            ],
          },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    // `routerLinkActive` settles after the navigation's render : the tabs read it on the next pass.
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  function tab(page: HTMLElement, testId: string): HTMLAnchorElement {
    return page.querySelector<HTMLAnchorElement>(`[data-testid="${testId}"]`)!;
  }

  it('links each tab to its route', async () => {
    const page = await at('/reports');

    expect(tab(page, 'tab-cash-flow').getAttribute('href')).toBe('/reports');
    expect(tab(page, 'tab-rules').getAttribute('href')).toBe('/reports/rules');
  });

  it('lights the account flow on /reports', async () => {
    const page = await at('/reports');

    expect(tab(page, 'tab-cash-flow').classList).toContain('mdc-tab--active');
    expect(tab(page, 'tab-rules').classList).not.toContain('mdc-tab--active');
  });

  it('lights the GUS rules on /reports/rules', async () => {
    const page = await at('/reports/rules');

    expect(tab(page, 'tab-rules').classList).toContain('mdc-tab--active');
    expect(tab(page, 'tab-cash-flow').classList).not.toContain('mdc-tab--active');
  });
});
