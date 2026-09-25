import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { StbFormFieldModule } from '../form-field';
import { StbInputModule } from '../input';

@Component({
  selector: 'ui-form-field-demo',

  imports: [StbFormFieldModule, StbInputModule],
  template: `
    <div>
      <div>
        <mat-form-field appearance="outline">
          <mat-label>Ticker</mat-label>
          <input matInput placeholder="AAPL" />
          <mat-hint>Uppercase, max 20 chars</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Disabled</mat-label>
          <input matInput value="Read-only" disabled />
        </mat-form-field>
      </div>

      <!-- The ✕ suffix : hidden on the empty field, shown as soon as it holds something. -->
      <div>
        <mat-form-field appearance="outline">
          <mat-label>Empty</mat-label>
          <input #empty matInput placeholder="Type to see the ✕" />
          <ui-form-field-reset matIconSuffix [for]="empty" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Filled</mat-label>
          <input #ticker matInput value="KTTA" />
          <ui-form-field-reset matIconSuffix [for]="ticker" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Note</mat-label>
          <textarea #note matInput rows="2">Gap 62 %, float 1.8 M</textarea>
          <ui-form-field-reset matIconSuffix [for]="note" />
        </mat-form-field>
      </div>
    </div>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Form field',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'Outlined input wrapper with label / hint / error / prefix / suffix slots. Used everywhere in the app for text input. `<ui-form-field-reset matIconSuffix [for]="field" />` adds the ✕ that empties the field — it appears only once the field holds something, and its wording comes from `StbFormFieldResetIntl` (English in the lib, translated by the app).',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
