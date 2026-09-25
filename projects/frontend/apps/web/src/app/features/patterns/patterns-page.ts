import { DatePipe } from '@angular/common';
import { Component, ElementRef, Injector, afterNextRender, inject, signal } from '@angular/core';
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
  private readonly injector = inject(Injector);
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
   * rather than letting the browser jump to a header that may not even be in the page.
   */
  followSheetLink(event: MouseEvent): void {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#sheet-"]');
    if (!link) return;
    event.preventDefault();
    const anchor = link.getAttribute('href')!.slice(1);
    const target = sheetOf(anchor);
    if (!target) return;
    this.tab.set(TABS.indexOf(target.shelf));
    this.setOpen(anchor, true);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector(`#${anchor}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      { injector: this.injector },
    );
  }
}
