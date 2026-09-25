import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import {
  MAT_RIPPLE_GLOBAL_OPTIONS,
  RippleGlobalOptions,
  provideNativeDateAdapter,
} from '@angular/material/core';
import {
  MAT_FORM_FIELD_DEFAULT_OPTIONS,
  MatFormFieldDefaultOptions,
} from '@angular/material/form-field';
import { MatIconRegistry } from '@angular/material/icon';
import { MAT_TABS_CONFIG, MatTabsConfig } from '@angular/material/tabs';

/**
 * The app-wide Material defaults of the design system — call it once, in the app config :
 *
 * - **Date adapter** — `<mat-datepicker>` looks it up in the environment injector, so a
 *   component-level import is too narrow (NG0201). The native adapter ; swap for the date-fns one
 *   if locale-aware parsing is ever needed.
 * - **No click ripples** — the design relies on flat hover / pressed backgrounds ; Material's
 *   state layers still give hover and focus feedback.
 * - **Dense forms** — outlined fields, and the hint / error line only takes space when it has
 *   something to show (M3 reserves it on every field otherwise). Field height comes from
 *   `mat.form-field-density(-4)` in `form-field.scss`.
 * - **Icon font** — ligature icons render with Material Symbols Rounded, loaded by
 *   `styles/_fonts.scss`.
 * - **Tabs** — sized to their label and aligned left, rather than stretched across the row.
 */
export function provideStbMaterial(): (Provider | EnvironmentProviders)[] {
  return [
    provideNativeDateAdapter(),
    {
      provide: MAT_RIPPLE_GLOBAL_OPTIONS,
      useValue: { disabled: true } satisfies RippleGlobalOptions,
    },
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: {
        appearance: 'outline',
        subscriptSizing: 'dynamic',
      } satisfies MatFormFieldDefaultOptions,
    },
    {
      provide: MAT_TABS_CONFIG,
      useValue: { stretchTabs: false, alignTabs: 'start' } satisfies MatTabsConfig,
    },
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass(
        'material-symbols-rounded',
        'mat-ligature-font',
      );
    }),
  ];
}
