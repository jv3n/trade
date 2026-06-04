import { NgModule } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

/**
 * StbButtonToggleModule — design-system wrapper around Material's [MatButtonToggleModule]. Consumers import this
 * instead of `MatButtonToggleModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatButtonToggleModule],
  exports: [MatButtonToggleModule],
})
export class StbButtonToggleModule {}
