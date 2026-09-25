import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { StbButtonModule, StbIconModule, StbMenuModule } from '@portfolioai/ui';
import { CALCULATORS } from '../calculators';
import { CalculatorWidgets } from './calculator-widgets';

/**
 * The top bar's « Calculatrices » (#421) : a menu of the calculators, each opened as a floating
 * widget. One already open is marked, and picking it brings it forward rather than a second copy.
 */
@Component({
  selector: 'app-calculator-launcher',
  imports: [StbButtonModule, StbIconModule, StbMenuModule, TranslatePipe],
  template: `
    <button mat-button type="button" [matMenuTriggerFor]="menu">
      <mat-icon>calculate</mat-icon>
      <span>{{ 'calculator.launcher.open' | translate }}</span>
    </button>
    <mat-menu #menu="matMenu">
      @for (c of calculators; track c.key) {
        <button mat-menu-item type="button" (click)="widgets.show(c.key)">
          <mat-icon>{{ c.icon }}</mat-icon>
          <span>{{ c.title | translate }}</span>
          @if (widgets.isOpen(c.key)) {
            <span class="launcher-open">{{ 'calculator.launcher.isOpen' | translate }}</span>
          }
        </button>
      }
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
export class CalculatorLauncher {
  protected readonly widgets = inject(CalculatorWidgets);
  protected readonly calculators = CALCULATORS;
}
