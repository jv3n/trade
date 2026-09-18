import { NgModule } from '@angular/core';
import { MatInputModule } from '@angular/material/input';

/**
 * StbInputModule — design-system wrapper around Material's [MatInputModule]. Consumers import this
 * instead of `MatInputModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatInputModule],
  exports: [MatInputModule],
})
export class StbInputModule {}
