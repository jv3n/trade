import { NgModule } from '@angular/core';
import { MatDividerModule } from '@angular/material/divider';

/**
 * StbDividerModule — design-system wrapper around Material's [MatDividerModule]. Consumers import this
 * instead of `MatDividerModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatDividerModule],
  exports: [MatDividerModule],
})
export class StbDividerModule {}
