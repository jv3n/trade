import { NgModule } from '@angular/core';
import { MatSelectModule } from '@angular/material/select';

/**
 * StbSelectModule — design-system wrapper around Material's [MatSelectModule]. Consumers import this
 * instead of `MatSelectModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatSelectModule],
  exports: [MatSelectModule],
})
export class StbSelectModule {}
