import { NgModule } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';

/**
 * StbFormFieldModule — design-system wrapper around Material's [MatFormFieldModule]. Consumers import this
 * instead of `MatFormFieldModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatFormFieldModule],
  exports: [MatFormFieldModule],
})
export class StbFormFieldModule {}
