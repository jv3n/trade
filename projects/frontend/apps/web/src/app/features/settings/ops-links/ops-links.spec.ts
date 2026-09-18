/**
 * Tests on [OpsLinksPage] — static catalog of external infra dashboards / billing / admin
 * consoles. Zero backend, zero state. The component just iterates an in-code constant
 * (`OPS_LINKS_SECTIONS`) declared in `ops-links.ts`.
 *
 * What we pin (3 invariants — the only ones that actually matter for a static page) :
 *
 * - **Every section has at least one link**. An empty `links: []` would render an empty bullet
 *   list — pointless and confusing for a user who clicked the section title expecting content.
 *   Forces the catalog to evolve coherently (you don't add a section header without populating it).
 * - **Every `<a>` opens in a new tab with the `noopener noreferrer` security pair**. This is the
 *   ops UX contract (you click a dashboard from the running app, you don't lose the session — the
 *   destination opens in a sibling tab) AND the standard security contract (the destination
 *   can't access `window.opener` to redirect us, and the referer header doesn't leak the app URL).
 *   A future refactor that drops one of the three attributes would silently break either UX or
 *   security ; this assertion trips immediately.
 * - **Every URL is absolute HTTPS**. The page is for external destinations only ; an in-app
 *   route or http:// link would either fail target=_blank semantics or expose plain-HTTP requests.
 */
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { OpsLinksPage } from './ops-links';

describe('OpsLinksPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpsLinksPage],
      providers: [provideTranslateService({ lang: 'en' })],
    }).compileComponents();
  });

  it('renders the page shell with the root testid', () => {
    const fixture = TestBed.createComponent(OpsLinksPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="ops-links-page"]')).not.toBeNull();
  });

  it('renders every section with at least one link', () => {
    const fixture = TestBed.createComponent(OpsLinksPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.sections.length).toBeGreaterThan(0);
    component.sections.forEach((section) => {
      expect(section.links.length).toBeGreaterThan(0);
    });

    // Cross-check the DOM : number of `.ops-section` elements matches the constant.
    const sectionEls = fixture.nativeElement.querySelectorAll('.ops-section');
    expect(sectionEls.length).toBe(component.sections.length);
  });

  it('opens every link in a new tab with the noopener noreferrer security pair', () => {
    const fixture = TestBed.createComponent(OpsLinksPage);
    fixture.detectChanges();

    const links: HTMLAnchorElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.ops-link-list a'),
    );

    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      expect(link.target).toBe('_blank');
      // `rel="noopener noreferrer"` — the destination can't access window.opener (no tab-jacking
      // redirect on us) and the referer header doesn't leak. Standard target=_blank companion.
      const rel = link.rel.split(/\s+/);
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    });
  });

  it('every link URL is absolute HTTPS', () => {
    const fixture = TestBed.createComponent(OpsLinksPage);
    const component = fixture.componentInstance;

    component.sections.forEach((section) => {
      section.links.forEach((link) => {
        expect(link.url.startsWith('https://')).toBe(true);
      });
    });
  });
});
