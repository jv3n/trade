import { NgModule } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';

/**
 * StbCheckboxModule — design-system wrapper around Material's [MatCheckboxModule]. Consumers import this
 * instead of `MatCheckboxModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatCheckboxModule],
  exports: [MatCheckboxModule],
})
export class StbCheckboxModule {}
