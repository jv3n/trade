import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbFormFieldModule } from '../form-field';
import { StbInputModule } from '../input';

@Component({
  selector: 'ui-form-field-demo',
  standalone: true,
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
          'Outlined input wrapper with label / hint / error / prefix / suffix slots. Used everywhere in the app for text input.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
