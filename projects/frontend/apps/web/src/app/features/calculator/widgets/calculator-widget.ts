import { CdkDrag, CdkDragEnd, CdkDragHandle } from '@angular/cdk/drag-drop';
import { NgComponentOutlet } from '@angular/common';
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
import { TranslatePipe } from '@ngx-translate/core';
import { StbButtonModule, StbIconModule, StbTooltipModule } from '@portfolioai/ui';
import { ThemeService } from '../../../core/app-state/theme.service';
import { calculator } from '../calculators';
import { CALCULATOR_DETACHED, CalculatorWidgets, OpenWidget } from './calculator-widgets';
import { copyStyles } from './copy-styles';
import { documentPip } from './document-pip';

/** One object, not a literal per read : the same reference keeps CdkDrag from being notified. */
const ORIGIN = { x: 0, y: 0 };

/**
 * One calculator floating over the page (#421) : its card under a header that drags it, detaches
 * it into its own window, or closes it. Escape closes it too.
 *
 * **Detached**, the widget's element is moved — not re-created — into a Document Picture-in-Picture
 * window, so the card keeps its state and its store. That window starts bare : the page's
 * stylesheets and its theme are copied over, and the theme follows while it is open. When the window
 * closes, by the user or the OS, the element goes back where it was.
 */
@Component({
  selector: 'app-calculator-widget',
  imports: [
    CdkDrag,
    CdkDragHandle,
    NgComponentOutlet,
    StbButtonModule,
    StbIconModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './calculator-widget.html',
  styleUrl: './calculator-widget.scss',
  providers: [
    { provide: CALCULATOR_DETACHED, useFactory: () => inject(CalculatorWidget).detached },
  ],
})
export class CalculatorWidget {
  private readonly widgets = inject(CalculatorWidgets);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  private readonly drag = viewChild.required(CdkDrag);

  readonly widget = input.required<OpenWidget>();
  readonly calculator = computed(() => calculator(this.widget().key));
  /** Offered only where the browser has the API ; the widget works in the page anyway. */
  readonly canDetach = documentPip() !== null;
  private readonly pipWindow = signal<Window | null>(null);
  readonly detached = computed(() => this.pipWindow() !== null);
  /**
   * Pinned to the origin while detached : a click brings the widget forward, and a page position
   * handed to the drag then would translate the card out of its window, leaving it blank.
   */
  readonly position = computed(() =>
    this.detached() ? ORIGIN : { x: this.widget().x, y: this.widget().y },
  );
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
    this.widgets.focus(this.widget().key);
  }

  dropped(event: CdkDragEnd): void {
    const { x, y } = event.source.getFreeDragPosition();
    this.widgets.moveTo(this.widget().key, x, y);
  }

  close(): void {
    this.widgets.close(this.widget().key);
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
      const placeholder = document.createComment('calculator-widget');
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
