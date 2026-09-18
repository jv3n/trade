import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbSliderModule } from './slider.module';

@Component({
  selector: 'ui-slider-demo',

  imports: [StbSliderModule],
  template: `
    <div>
      <div>
        <mat-slider min="0" max="100" step="5" discrete>
          <input matSliderThumb [value]="40" />
        </mat-slider>
      </div>
    </div>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Slider',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'Range input. `discrete` shows the value tooltip on drag. Material 16+ requires the inner `<input matSliderThumb>` accessor.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
