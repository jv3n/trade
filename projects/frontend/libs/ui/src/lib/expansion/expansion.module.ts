import { NgModule } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';

/**
 * StbExpansionModule — design-system wrapper around Material's [MatExpansionModule] : the
 * accordion and its expansion panels, styled as the lib's cards (surface, hairline border, large
 * radius, no elevation shadow).
 */
@NgModule({
  imports: [MatExpansionModule],
  exports: [MatExpansionModule],
})
export class StbExpansionModule {}
