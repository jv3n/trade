import { NgModule } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * StbTooltipModule — design-system wrapper around Material's [MatTooltipModule]. Consumers import this
 * instead of `MatTooltipModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatTooltipModule],
  exports: [MatTooltipModule],
})
export class StbTooltipModule {}
