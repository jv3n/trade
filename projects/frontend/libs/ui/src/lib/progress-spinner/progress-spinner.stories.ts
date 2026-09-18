import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbProgressSpinnerModule } from '../progress-spinner';

@Component({
  selector: 'ui-progress-spinner-demo',

  imports: [StbProgressSpinnerModule],
  template: `
    <div>
      <div>
        <mat-spinner diameter="16" />
        <mat-spinner diameter="24" />
        <mat-spinner diameter="40" />
        <mat-spinner mode="determinate" [value]="65" diameter="40" />
      </div>
    </div>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Progress spinner',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'Indeterminate spinner (default) or determinate with `[value]` 0–100. Embed in CTAs to surface loading states.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
