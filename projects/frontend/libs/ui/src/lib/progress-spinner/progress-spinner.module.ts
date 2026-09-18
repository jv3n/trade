import { NgModule } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/**
 * StbProgressSpinnerModule — design-system wrapper around Material's [MatProgressSpinnerModule]. Consumers import this
 * instead of `MatProgressSpinnerModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatProgressSpinnerModule],
  exports: [MatProgressSpinnerModule],
})
export class StbProgressSpinnerModule {}
