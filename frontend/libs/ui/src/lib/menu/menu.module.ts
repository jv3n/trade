import { NgModule } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';

/**
 * StbMenuModule — design-system wrapper around Material's [MatMenuModule]. Consumers import this
 * instead of `MatMenuModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatMenuModule],
  exports: [MatMenuModule],
})
export class StbMenuModule {}
