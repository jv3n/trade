import { NgModule } from '@angular/core';
import { MatListModule } from '@angular/material/list';

/**
 * StbListModule — design-system wrapper around Material's [MatListModule]. Consumers import this
 * instead of `MatListModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatListModule],
  exports: [MatListModule],
})
export class StbListModule {}
