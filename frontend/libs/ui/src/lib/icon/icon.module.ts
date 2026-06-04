import { NgModule } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * StbIconModule — design-system wrapper around Material's [MatIconModule]. Consumers import this
 * instead of `MatIconModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatIconModule],
  exports: [MatIconModule],
})
export class StbIconModule {}
