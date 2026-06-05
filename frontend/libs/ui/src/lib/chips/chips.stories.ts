import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { StbIconModule } from '../icon';
import type { StbChipVariant } from '@portfolioai/ui';
import { StbChipsModule } from './chips.module';

type Variant = StbChipVariant | 'default';

interface ChipArgs {
  variant: Variant;
  label: string;
  highlighted: boolean;
  disabled: boolean;
  withIcon: boolean;
}

@Component({
  selector: 'ui-chips-demo',

  imports: [StbChipsModule, StbIconModule],
  template: `
    <mat-chip-set>
      @switch (variant) {
        @case ('ticker') {
          <mat-chip stbChip="ticker" [highlighted]="highlighted" [disabled]="disabled">
            @if (withIcon) {
              <mat-icon matChipLeadingIcon>trending_up</mat-icon>
            }
            {{ label }}
          </mat-chip>
        }
        @default {
          <mat-chip [highlighted]="highlighted" [disabled]="disabled">
            @if (withIcon) {
              <mat-icon matChipLeadingIcon>bolt</mat-icon>
            }
            {{ label }}
          </mat-chip>
        }
      }
    </mat-chip-set>
  `,
})
class Demo implements ChipArgs {
  variant: Variant = 'default';
  label = 'BAC';
  highlighted = false;
  disabled = false;
  withIcon = false;
}

const meta: Meta<Demo> = {
  title: 'Components/Chips',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  argTypes: {
    variant: {
      description:
        '`default` uses the base chip palette (accent on selection). `ticker` is a trading-domain variant applied via the `[stbChip]` directive — label rendered in success-green to match the rest of the buy-side / PnL palette.',
      control: 'inline-radio',
      options: ['default', 'ticker'],
    },
    label: { control: 'text' },
    highlighted: {
      description: 'Material `highlighted` flag — drives the selected-state palette.',
      control: 'boolean',
    },
    disabled: { control: 'boolean' },
    withIcon: {
      description: 'Prepend a Material icon as `matChipLeadingIcon`.',
      control: 'boolean',
    },
  },
  args: {
    variant: 'default',
    label: 'BAC',
    highlighted: false,
    disabled: false,
    withIcon: false,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Compact tags — used for asset types, play tags, status markers. Use the controls panel to flip between the default palette and the `ticker` variant, and toggle `highlighted` / `disabled` / leading icon.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
