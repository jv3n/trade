import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { StbIconModule } from './icon.module';

@Component({
  selector: 'ui-icon-demo',

  imports: [StbIconModule],
  template: `
    <div>
      <div>
        <mat-icon>book</mat-icon>
        <mat-icon>analytics</mat-icon>
        <mat-icon>settings</mat-icon>
        <mat-icon>auto_awesome</mat-icon>
        <mat-icon>trending_up</mat-icon>
        <mat-icon>trending_down</mat-icon>
      </div>
    </div>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Icon',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'Material font icon. The app uses the `material-icons` package (loaded in `angular.json> styles`). Colour follows `currentColor`.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
