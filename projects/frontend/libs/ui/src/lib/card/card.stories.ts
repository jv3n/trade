import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { StbButtonModule } from '../button/button.module';
import { StbCardModule } from './card.module';

type Appearance = 'raised' | 'filled' | 'outlined';

interface CardArgs {
  appearance: Appearance;
  title: string;
  subtitle: string;
  body: string;
  showActions: boolean;
}

@Component({
  selector: 'ui-card-demo',

  imports: [StbCardModule, StbButtonModule],
  template: `
    <mat-card [appearance]="appearance">
      <mat-card-header>
        <mat-card-title>{{ title }}</mat-card-title>
        @if (subtitle) {
          <mat-card-subtitle>{{ subtitle }}</mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content>{{ body }}</mat-card-content>
      @if (showActions) {
        <mat-card-actions align="end">
          <button mat-button>Cancel</button>
          <button mat-flat-button>Confirm</button>
        </mat-card-actions>
      }
    </mat-card>
  `,
})
class Demo implements CardArgs {
  appearance: Appearance = 'raised';
  title = 'Trading journal';
  subtitle = 'Last 30 days';
  body = 'Log every trade with its setup, execution and review.';
  showActions = true;
}

const meta: Meta<Demo> = {
  title: 'Components/Card',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  argTypes: {
    appearance: {
      description: 'Material card appearance — `raised` (M3 elevated), `filled`, or `outlined`.',
      control: 'inline-radio',
      options: ['raised', 'filled', 'outlined'],
    },
    title: { control: 'text' },
    subtitle: { control: 'text' },
    body: { control: 'text' },
    showActions: { control: 'boolean' },
  },
  args: {
    appearance: 'raised',
    title: 'Trading journal',
    subtitle: 'Last 30 days',
    body: 'Log every trade with its setup, execution and review.',
    showActions: true,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Material card — three appearances styled via the lib (`libs/ui/src/lib/card/card.scss`). Use the controls panel to flip the appearance and the header / content / actions slots.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
