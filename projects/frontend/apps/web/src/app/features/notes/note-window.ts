import { CdkDrag, CdkDragEnd, CdkDragHandle } from '@angular/cdk/drag-drop';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { StbButtonModule, StbChipsModule, StbIconModule, StbTooltipModule } from '@portfolioai/ui';
import { filter, fromEvent, map } from 'rxjs';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { ThemeService } from '../../core/app-state/theme.service';
import { copyStyles } from '../../shared/picture-in-picture/copy-styles';
import { documentPip } from '../../shared/picture-in-picture/document-pip';
import { NOTE_COLORS, NotesStore, WATCHLIST } from './notes.store';

/** A window's width — about a post-it's, narrower than a calculator. */
export const NOTE_WIDTH = 280;
const ORIGIN = { x: 0, y: 0 };
/** Where a window never moved lands : past the sidenav, under the top bar, side by side. */
const FIRST_LEFT = 264;
const FIRST_TOP = 16;
const GAP = 16;
/** Each further post-it lands a little lower and to the right, so none hides another entirely. */
const CASCADE = 28;
/** What stays reachable of a window pushed against the bottom edge : its header, to drag it back. */
const HEADER = 40;
/** `$toolbar-height` — the layer starts under the top bar. */
const TOOLBAR = 64;

/**
 * One note window (#521) — a post-it or the ticker watchlist — floating over the page, dragged by
 * its header, in the paper colour picked. Closing it keeps what is in it ; a post-it can also be
 * deleted, confirmed when it holds text.
 *
 * **Detached**, the element moves into a Document Picture-in-Picture window, so it stays visible
 * over TradeZero during the session — the same mechanism as the calculators. Docked on a phone, it
 * neither floats nor drags.
 */
@Component({
  selector: 'app-note-window',
  imports: [
    CdkDrag,
    CdkDragHandle,
    StbButtonModule,
    StbChipsModule,
    StbIconModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './note-window.html',
  styleUrl: './note-window.scss',
})
export class NoteWindow {
  protected readonly notes = inject(NotesStore);
  private readonly confirm = inject(ConfirmService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  private readonly drag = viewChild.required(CdkDrag);

  /** `watchlist`, or a post-it's id. */
  readonly key = input.required<string>();
  /** Under the phone width the windows dock as a full-width panel (#521). */
  readonly docked = input(false);
  protected readonly colors = NOTE_COLORS;
  readonly isWatchlist = computed(() => this.key() === WATCHLIST);
  /** The post-it's place in the list — its title, « Post-it 2 », and where it lands by default. */
  private readonly index = computed(() =>
    this.notes.postits().findIndex((p) => p.id === this.key()),
  );
  protected readonly number = computed(() => this.index() + 1);
  protected readonly state = computed(
    () => this.notes.window(this.key()) ?? { open: false, color: 'yellow', x: null, y: null },
  );
  protected readonly text = computed(
    () => this.notes.postits().find((p) => p.id === this.key())?.text ?? '',
  );
  readonly canDetach = documentPip() !== null;
  private readonly pipWindow = signal<Window | null>(null);
  readonly detached = computed(() => this.pipWindow() !== null);
  /** The viewport, followed : a window dropped on a big screen must come back on a small one. */
  private readonly viewport = toSignal(
    fromEvent(window, 'resize').pipe(map(() => viewportSize())),
    { initialValue: viewportSize() },
  );
  /**
   * The dropped position, or a default side by side — clamped into the viewport either way, its
   * header always in reach. Pinned to the origin docked or detached.
   */
  readonly position = computed(() => {
    if (this.docked() || this.detached()) return ORIGIN;
    const { x, y } = this.state();
    const shift = this.isWatchlist() ? 0 : Math.max(0, this.index()) * CASCADE;
    const left = this.isWatchlist() ? FIRST_LEFT + NOTE_WIDTH + GAP : FIRST_LEFT + shift;
    const { width, height } = this.viewport();
    return {
      x: clamp(x ?? left, width - NOTE_WIDTH),
      y: clamp(y ?? FIRST_TOP + shift, height - TOOLBAR - HEADER),
    };
  });
  private destroyed = false;

  constructor() {
    effect(() => {
      const theme = this.theme.resolved();
      this.pipWindow()?.document.documentElement.setAttribute('data-theme', theme);
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.pipWindow()?.close();
    });
  }

  focus(): void {
    this.notes.front.set(this.key());
  }

  dropped(event: CdkDragEnd): void {
    const { x, y } = event.source.getFreeDragPosition();
    this.notes.moveTo(this.key(), x, y);
  }

  close(): void {
    this.pipWindow()?.close();
    this.notes.close(this.key());
  }

  onText(value: string): void {
    this.notes.setText(this.key(), value);
  }

  /** Deletes the post-it — asked first when there is text to lose, an empty one just goes. */
  remove(): void {
    const id = this.key();
    if (!this.text().trim()) {
      this.pipWindow()?.close();
      this.notes.removePostIt(id);
      return;
    }
    this.confirm
      .ask('notes.confirmDelete', { variant: 'danger' })
      .pipe(filter(Boolean))
      .subscribe(() => {
        this.pipWindow()?.close();
        this.notes.removePostIt(id);
      });
  }

  /** Enter adds the ticker typed ; the field empties once it is in the list. */
  addTicker(field: HTMLInputElement): void {
    if (this.notes.addTicker(field.value)) field.value = '';
  }

  /**
   * Called straight from the click : the browser only opens the window during a user gesture, so
   * nothing may be awaited before `requestWindow`.
   */
  detach(): void {
    const pip = documentPip();
    if (!pip || this.detached()) return;
    const element = this.host.nativeElement;
    const { width, height } = element.firstElementChild!.getBoundingClientRect();
    pip.requestWindow({ width: Math.ceil(width), height: Math.ceil(height) }).then((win) => {
      if (this.destroyed) {
        win.close();
        return;
      }
      copyStyles(document, win.document);
      // Set now, not left to the effect : it would run after the first paint, unthemed.
      win.document.documentElement.setAttribute('data-theme', this.theme.resolved());
      win.document.documentElement.setAttribute('lang', document.documentElement.lang);
      const placeholder = document.createComment('note-window');
      element.before(placeholder);
      this.drag().reset();
      win.document.body.append(element);
      this.pipWindow.set(win);
      win.addEventListener(
        'pagehide',
        () => {
          this.pipWindow.set(null);
          if (!this.destroyed) {
            placeholder.replaceWith(element);
            this.drag().setFreeDragPosition(this.position());
          } else {
            placeholder.remove();
          }
        },
        { once: true },
      );
    });
  }
}

function viewportSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Between 0 and [max] — and 0 when the viewport is narrower than the window itself. */
function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}
