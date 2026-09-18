import { NgModule } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';

/**
 * StbToolbarModule — design-system wrapper around Material's [MatToolbarModule]. Consumers import this
 * instead of `MatToolbarModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatToolbarModule],
  exports: [MatToolbarModule],
})
export class StbToolbarModule {}
