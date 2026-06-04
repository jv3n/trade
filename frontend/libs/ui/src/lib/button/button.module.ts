import { NgModule } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { StbSize, StbSpinnerEnd } from './button.directives';

/**
 * StbButtonModule — design-system wrapper around Material's [MatButtonModule], plus the
 * `[stbSize]` directive (xs / sm / md / lg) and `[stbSpinnerEnd]` (position a loading
 * spinner after the label).
 *
 * Consumers import this instead of `MatButtonModule` so token overrides, sizing classes
 * and any future PortfolioAI-specific behaviour live in a single place.
 */
@NgModule({
  imports: [MatButtonModule, StbSize, StbSpinnerEnd],
  exports: [MatButtonModule, StbSize, StbSpinnerEnd],
})
export class StbButtonModule {}
