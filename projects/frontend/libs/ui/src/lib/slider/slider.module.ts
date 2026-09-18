import { NgModule } from '@angular/core';
import { MatSliderModule } from '@angular/material/slider';

/**
 * StbSliderModule — design-system wrapper around Material's [MatSliderModule]. Consumers import this
 * instead of `MatSliderModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatSliderModule],
  exports: [MatSliderModule],
})
export class StbSliderModule {}
