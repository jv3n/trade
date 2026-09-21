import { NgModule } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { StbDanger, StbSize, StbTone } from './button.directives';

/**
 * StbButtonModule — design-system wrapper around Material's [MatButtonModule], plus the
 * `[stbSize]` directive (xs / sm / md / lg), `[stbTone]` (semantic colour : accent / success /
 * warning / danger), and `[stbDanger]` (destructive CTA).
 *
 * Consumers import this instead of `MatButtonModule` so token overrides, sizing classes
 * and any future PortfolioAI-specific behaviour live in a single place.
 */
@NgModule({
  imports: [MatButtonModule, StbDanger, StbSize, StbTone],
  exports: [MatButtonModule, StbDanger, StbSize, StbTone],
})
export class StbButtonModule {}
