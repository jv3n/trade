import { DatePipe } from '@angular/common';
import { Component, ElementRef, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  StbExpansionModule,
  StbIconModule,
  StbProgressSpinnerModule,
  StbTabsModule,
} from '@portfolioai/ui';
import { catchError, forkJoin, map, of } from 'rxjs';

import { PatternsRepository } from '../../core/api/patterns/patterns.repository';
import { LanguageService } from '../../core/app-state/language.service';
import { SHELVES, Sheet, Shelf, parseSheet, sheetAnchor, sheetOf, unreadableSheet } from './sheet';

/** The tabs, in order : the patterns, then what is not one. */
const TABS: readonly Shelf[] = ['pattern', 'notes'];

/**
 * The pattern sheets and trading notes, read-only, laid out after `mockup/patterns.html` (#419) : a
 * tab per folder of `docs/`, an expansion panel per file, shipped with the build — the French twin
 * of each file when the interface is in French. There is no copy anywhere else — revising a sheet
 * means editing its file, so this page reaches no write endpoint.
 */
@Component({
  selector: 'app-patterns-page',
  imports: [
    DatePipe,
    StbExpansionModule,
    StbIconModule,
    StbProgressSpinnerModule,
    StbTabsModule,
    TranslatePipe,
  ],
  templateUrl: './patterns-page.html',
  styleUrl: './patterns-page.scss',
})
export class PatternsPage {
  private readonly repo = inject(PatternsRepository);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly language = inject(LanguageService);

  readonly tabs = TABS;
  readonly loading = signal(true);
  readonly sheets = signal<Record<Shelf, Sheet[]>>({ pattern: [], notes: [] });
  readonly tab = signal(0);
  /** Anchors of the open panels ; GUS open on arrival, the sheet the day starts with. */
  readonly open = signal<ReadonlySet<string>>(
    new Set([sheetAnchor({ shelf: 'pattern', file: 'GUS' })]),
  );

  readonly anchor = sheetAnchor;

  /**
   * The panel a followed link brings into view, and the one animation it waits for : the tab's
   * when the link switches tab, the panel's own when it opens one on the current tab.
   */
  private pendingScroll: { anchor: string; after: 'tab' | 'panel' } | null = null;

  constructor() {
    // A change of language reloads the app (`LanguageService`), so the language is read once.
    const lang = this.language.lang();
    const load = (shelf: Shelf) =>
      forkJoin(
        SHELVES[shelf].map((file) =>
          this.repo.markdown(shelf, file, lang).pipe(
            map((source) => parseSheet({ shelf, file }, source)),
            // One file missing costs its own panel, not the page : it is read mid-session.
            catchError(() => of(unreadableSheet({ shelf, file }))),
          ),
        ),
      );
    forkJoin({ pattern: load('pattern'), notes: load('notes') }).subscribe((sheets) => {
      this.sheets.set(sheets);
      this.loading.set(false);
    });
  }

  setOpen(anchor: string, opened: boolean): void {
    this.open.update((current) => {
      const next = new Set(current);
      if (opened) next.add(anchor);
      else next.delete(anchor);
      return next;
    });
  }

  /**
   * A link from one file to another switches to its tab, opens its panel and brings it into view —
   * rather than letting the browser jump to a header that may not even be in the page. The scroll
   * waits for the animation that moves the panel : taken mid-animation, it was lost (#424).
   */
  followSheetLink(event: MouseEvent): void {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#sheet-"]');
    if (!link) return;
    event.preventDefault();
    const anchor = link.getAttribute('href')!.slice(1);
    const target = sheetOf(anchor);
    if (!target) return;
    const index = TABS.indexOf(target.shelf);
    if (index !== this.tab()) this.pendingScroll = { anchor, after: 'tab' };
    else if (!this.open().has(anchor)) this.pendingScroll = { anchor, after: 'panel' };
    else {
      this.pendingScroll = null;
      this.scrollTo(anchor);
      return;
    }
    this.tab.set(index);
    this.setOpen(anchor, true);
  }

  /**
   * An animation ended. Only the one the followed link waits for scrolls : a panel expanding while
   * the tab still slides would scroll too early, and one opened by hand later must not scroll back.
   */
  settled(after: 'tab' | 'panel', anchor?: string): void {
    const pending = this.pendingScroll;
    if (pending?.after !== after || (after === 'panel' && anchor !== pending.anchor)) return;
    // Kept pending while the panel is not in the DOM yet : a tab's content attaches mid-animation.
    if (this.scrollTo(pending.anchor)) this.pendingScroll = null;
  }

  /**
   * The panel in view is the feature, the glide is decoration : instant under reduced motion, and
   * redone instantly when a browser silently drops the smooth scroll (#440).
   */
  private scrollTo(anchor: string): boolean {
    const panel = this.host.nativeElement.querySelector(`#${anchor}`);
    if (!panel) return false;
    const smooth = !prefersReducedMotion();
    const top = panel.getBoundingClientRect().top;
    panel.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    // A smooth scroll that runs has moved the panel within two frames. One already in place moves
    // neither way : redoing its scroll is a harmless no-op.
    if (smooth) {
      afterTwoFrames(() => {
        if (panel.isConnected && panel.getBoundingClientRect().top === top) {
          panel.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      });
    }
    return true;
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function afterTwoFrames(callback: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(callback));
}
