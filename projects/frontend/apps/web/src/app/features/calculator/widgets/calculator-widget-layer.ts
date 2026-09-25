import { Component, inject } from '@angular/core';
import { CalculatorWidget } from './calculator-widget';
import { CalculatorWidgets } from './calculator-widgets';

/**
 * Where the floating calculators live (#421) — rendered once, in `app.html`, over every page. The
 * layer lets the clicks through ; only the widgets take them.
 */
@Component({
  selector: 'app-calculator-widget-layer',
  imports: [CalculatorWidget],
  template: `
    <div class="calc-widgets">
      @for (widget of widgets.open(); track widget.key) {
        <app-calculator-widget [widget]="widget" />
      }
    </div>
  `,
  styles: `
    // Under Material's overlays (menus, tooltips, dialogs — 1000), over the page and its toolbar.
    .calc-widgets {
      position: fixed;
      inset: 0;
      z-index: 900;
      pointer-events: none;
    }
  `,
})
export class CalculatorWidgetLayer {
  protected readonly widgets = inject(CalculatorWidgets);
}
