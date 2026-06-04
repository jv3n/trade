import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbDividerModule } from './divider.module';

@Component({
  selector: 'ui-divider-demo',
  standalone: true,
  imports: [StbDividerModule],
  template: `
    <div>
      <div>
        <div>Section A</div>
        <mat-divider />
        <div>Section B</div>
        <mat-divider />
        <div>Section C</div>
      </div>
    </div>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Divider',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'Horizontal rule between sections. `vertical` attribute for a vertical separator inside flex rows.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
