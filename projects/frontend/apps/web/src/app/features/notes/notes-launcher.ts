import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { StbButtonModule, StbIconModule, StbMenuModule } from '@portfolioai/ui';
import { NotesStore, PostIt, WATCHLIST } from './notes.store';

/** How long a post-it's first line may run in the menu before it is cut. */
const LABEL_LENGTH = 28;

/**
 * The top bar's « Notes » (#521) : a new post-it, then every post-it of the day and the ticker
 * watchlist, each toggled on its own — the open ones marked.
 */
@Component({
  selector: 'app-notes-launcher',
  imports: [StbButtonModule, StbIconModule, StbMenuModule, TranslatePipe],
  template: `
    <button mat-button type="button" [matMenuTriggerFor]="menu">
      <mat-icon>sticky_note_2</mat-icon>
      <span>{{ 'notes.launcher.open' | translate }}</span>
    </button>
    <mat-menu #menu="matMenu">
      <button mat-menu-item type="button" (click)="notes.addPostIt()">
        <mat-icon>add</mat-icon>
        <span>{{ 'notes.launcher.newPostit' | translate }}</span>
      </button>
      @for (postit of notes.postits(); track postit.id; let i = $index) {
        <button mat-menu-item type="button" (click)="notes.toggle(postit.id)">
          <mat-icon>edit_note</mat-icon>
          <span>{{ label(postit) || ('notes.postit.title' | translate: { n: i + 1 }) }}</span>
          @if (postit.open) {
            <span class="launcher-open">{{ 'notes.launcher.isOpen' | translate }}</span>
          }
        </button>
      }
      <button mat-menu-item type="button" (click)="notes.toggle(watchlist)">
        <mat-icon>visibility</mat-icon>
        <span>{{ 'notes.watchlist.title' | translate }}</span>
        @if (notes.isOpen(watchlist)) {
          <span class="launcher-open">{{ 'notes.launcher.isOpen' | translate }}</span>
        }
      </button>
    </mat-menu>
  `,
  styles: `
    @use 'sizes' as s;

    .launcher-open {
      margin-left: s.$space-sm;
      font-size: s.$font-2xs;
      color: var(--color-accent);
    }
  `,
})
export class NotesLauncher {
  protected readonly notes = inject(NotesStore);
  protected readonly watchlist = WATCHLIST;

  /** A post-it reads by its first line in the menu — empty, it falls back to « Post-it n ». */
  label(postit: PostIt): string {
    const line = postit.text.trim().split('\n')[0].trim();
    return line.length > LABEL_LENGTH ? line.slice(0, LABEL_LENGTH - 1) + '…' : line;
  }
}
