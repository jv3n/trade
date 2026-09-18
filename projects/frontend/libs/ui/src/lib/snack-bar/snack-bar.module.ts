import { NgModule } from '@angular/core';
import { MatSnackBarModule } from '@angular/material/snack-bar';

/**
 * StbSnackBarModule — design-system wrapper around Material's [MatSnackBarModule].
 *
 * Snackbars are opened imperatively via the `MatSnackBar` service (`MatSnackBar.open(...)`),
 * not through a template selector — there's no `<mat-snack-bar>` element on the consumer
 * side. The container component is rendered into the CDK overlay by the service. Importing
 * `StbSnackBarModule` exposes the service to the consumer's DI graph and brings in the lib's
 * token overrides (cf. `snack-bar.scss`).
 *
 * Consumers import this instead of `MatSnackBarModule` so token overrides and any future
 * PortfolioAI-specific defaults live in a single place.
 */
@NgModule({
  imports: [MatSnackBarModule],
  exports: [MatSnackBarModule],
})
export class StbSnackBarModule {}
