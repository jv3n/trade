import { NgModule } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { StbFormFieldReset } from './form-field-reset';

/**
 * StbFormFieldModule — design-system wrapper around Material's [MatFormFieldModule], plus
 * [StbFormFieldReset], the ✕ suffix that empties a field.
 *
 * Consumers import this instead of `MatFormFieldModule` so token overrides and any future
 * PortfolioAI-specific directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatFormFieldModule, StbFormFieldReset],
  exports: [MatFormFieldModule, StbFormFieldReset],
})
export class StbFormFieldModule {}
