import { NgModule } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';

/**
 * StbSidenavModule — design-system wrapper around Material's [MatSidenavModule]. Consumers import this
 * instead of `MatSidenavModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatSidenavModule],
  exports: [MatSidenavModule],
})
export class StbSidenavModule {}
