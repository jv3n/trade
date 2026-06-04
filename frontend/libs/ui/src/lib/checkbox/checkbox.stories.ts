import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbCheckboxModule } from './checkbox.module';

@Component({
  selector: 'ui-checkbox-demo',
  standalone: true,
  imports: [StbCheckboxModule],
  template: `
    <div>
      <div>
        <mat-checkbox checked>Checked</mat-checkbox>
        <mat-checkbox>Unchecked</mat-checkbox>
        <mat-checkbox indeterminate>Indeterminate</mat-checkbox>
        <mat-checkbox disabled checked>Disabled (checked)</mat-checkbox>
      </div>
    </div>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Checkbox',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'Tri-state checkbox — checked, unchecked, indeterminate. Disabled state respects the lib palette.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
