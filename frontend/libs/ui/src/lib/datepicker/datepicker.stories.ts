import { Component, signal } from '@angular/core';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { applicationConfig, moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import { StbDatePickerModule } from './datepicker.module';

// Stories for the Material datepicker theming. Material's `MatDatepickerInput` is its own
// `ControlValueAccessor` — Signal Forms' `[formField]` would clash with it (both want the
// NG_VALUE_ACCESSOR seat), so the pattern in PortfolioAI is `[value]` + `(dateChange)` with
// a signal-backed model. The stories below mirror that pattern so the visual matches the app.

@Component({
  selector: 'ui-datepicker-demo',
  standalone: true,
  imports: [MatFormFieldModule, MatIconModule, MatInputModule, StbDatePickerModule],
  template: `
    <div style="display:flex; flex-direction:column; gap:1rem; padding:1.5rem; min-width:320px;">
      <mat-form-field appearance="outline">
        <mat-label>Trade date</mat-label>
        <input
          matInput
          [matDatepicker]="picker"
          [value]="value()"
          (dateChange)="value.set($event.value)"
        />
        <mat-datepicker-toggle matIconSuffix [for]="picker" />
        <mat-datepicker #picker />
      </mat-form-field>
      <p style="margin:0; font-family:var(--font-family); color:var(--color-text-muted); font-size:0.85rem;">
        Bound value : <code style="font-family:var(--font-mono); color:var(--color-text);">{{ value()?.toISOString() ?? 'null' }}</code>
      </p>
    </div>
  `,
})
class DatepickerDemo {
  readonly value = signal<Date | null>(new Date(2026, 5, 4));
}

const meta: Meta<DatepickerDemo> = {
  title: 'Form/Datepicker',
  component: DatepickerDemo,
  decorators: [
    // `DateAdapter` is registered at the application level (same pattern as
    // `apps/web/src/app/app.config.ts` does in the consumer app — `provideNativeDateAdapter()`
    // there, here scoped to the Storybook preview).
    applicationConfig({ providers: [provideNativeDateAdapter()] }),
    moduleMetadata({ imports: [] }),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Material datepicker themed through the lib. Bind via `[value]` + `(dateChange)` (not `[formField]`) — Material\'s `MatDatepickerInput` is its own `ControlValueAccessor` and conflicts with Signal Forms\' binding.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<DatepickerDemo>;

export const Dark: Story = {};

export const Light: Story = {
  render: () => ({
    template: `<div data-theme="light"><ui-datepicker-demo /></div>`,
  }),
};

export const BothThemes: Story = {
  name: 'Dark vs Light',
  render: () => ({
    template: `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:2px; background:#000;">
        <div style="background:var(--color-bg); padding:1rem;">
          <h4 style="margin:0 0 0.5rem; color:var(--color-text); font-family:var(--font-family); font-size:0.85rem; font-weight:600;">Dark</h4>
          <ui-datepicker-demo />
        </div>
        <div data-theme="light" style="background:var(--color-bg); padding:1rem;">
          <h4 style="margin:0 0 0.5rem; color:var(--color-text); font-family:var(--font-family); font-size:0.85rem; font-weight:600;">Light</h4>
          <ui-datepicker-demo />
        </div>
      </div>
    `,
  }),
};
