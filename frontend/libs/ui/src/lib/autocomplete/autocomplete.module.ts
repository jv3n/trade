import { NgModule } from '@angular/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

/**
 * StbAutocompleteModule — design-system wrapper around Material's [MatAutocompleteModule]. Consumers import this
 * instead of `MatAutocompleteModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatAutocompleteModule],
  exports: [MatAutocompleteModule],
})
export class StbAutocompleteModule {}
