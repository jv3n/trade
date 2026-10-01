import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { NoteWindow } from './note-window';
import { NotesStore, WATCHLIST } from './notes.store';

/** `$bp-phone` of `libs/ui/styles/_sizes.scss`. */
const PHONE = '(max-width: 640px)';

/**
 * Where the note windows live (#521) — rendered once, in `app.html`, over every page and under the
 * top bar. The layer lets the clicks through ; only the windows take them. On a phone it docks
 * them at the foot of the screen instead.
 */
@Component({
  selector: 'app-notes-layer',
  imports: [NoteWindow],
  template: `
    <div class="notes-layer" [class.notes-layer--docked]="phone()">
      @for (key of openKeys(); track key) {
        <app-note-window [key]="key" [docked]="phone()" />
      }
    </div>
  `,
  styles: `
    @use 'sizes' as s;

    // Under Material's overlays (1000) and the calculators (900), over the page — never over the
    // top bar, so the layer starts below it.
    .notes-layer {
      position: fixed;
      inset: s.$toolbar-height 0 0 0;
      z-index: 890;
      pointer-events: none;
    }

    .notes-layer--docked {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      overflow-y: auto;
    }
  `,
})
export class NotesLayer {
  private readonly notes = inject(NotesStore);
  protected readonly phone = toSignal(
    inject(BreakpointObserver)
      .observe(PHONE)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  protected readonly openKeys = computed(() => [
    ...this.notes
      .postits()
      .filter((p) => p.open)
      .map((p) => p.id),
    ...(this.notes.isOpen(WATCHLIST) ? [WATCHLIST] : []),
  ]);
}
