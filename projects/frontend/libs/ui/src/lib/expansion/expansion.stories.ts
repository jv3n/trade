import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { StbButtonModule } from '../button/button.module';
import { StbIconModule } from '../icon';
import { StbExpansionModule } from './expansion.module';

interface ExpansionArgs {
  hideToggle: boolean;
  disabled: boolean;
  showDescription: boolean;
  showActionRow: boolean;
  multi: boolean;
}

@Component({
  selector: 'ui-expansion-demo',

  imports: [StbExpansionModule, StbButtonModule, StbIconModule],
  template: `
    <mat-accordion [multi]="multi" displayMode="default">
      <mat-expansion-panel [hideToggle]="hideToggle" [disabled]="disabled">
        <mat-expansion-panel-header>
          <mat-panel-title>Risk profile</mat-panel-title>
          @if (showDescription) {
            <mat-panel-description>
              Position sizing, stop-loss, max drawdown
            </mat-panel-description>
          }
        </mat-expansion-panel-header>

        <p>
          Default rules used when opening a trade : 1 % account risk per trade, hard stop at the
          swing low, daily loss limit at 3 % of equity.
        </p>

        @if (showActionRow) {
          <mat-action-row>
            <button mat-button>Reset</button>
            <button mat-flat-button>Save</button>
          </mat-action-row>
        }
      </mat-expansion-panel>

      <mat-expansion-panel [hideToggle]="hideToggle">
        <mat-expansion-panel-header>
          <mat-panel-title>Plays</mat-panel-title>
          @if (showDescription) {
            <mat-panel-description> Setup taxonomy used in the journal </mat-panel-description>
          }
        </mat-expansion-panel-header>
        <p>
          Breakout, Reversal, Momentum, Pullback. Tracked per-trade in the journal table for PnL
          attribution by play.
        </p>
      </mat-expansion-panel>

      <mat-expansion-panel [hideToggle]="hideToggle">
        <mat-expansion-panel-header>
          <mat-panel-title>Patterns</mat-panel-title>
          @if (showDescription) {
            <mat-panel-description> Chart structures triggering an entry </mat-panel-description>
          }
        </mat-expansion-panel-header>
        <p>Flag, Cup &amp; Handle, ABCD, Double-bottom, Bull-flag continuation.</p>
      </mat-expansion-panel>
    </mat-accordion>
  `,
})
class Demo implements ExpansionArgs {
  hideToggle = false;
  disabled = false;
  showDescription = true;
  showActionRow = true;
  multi = false;
}

const meta: Meta<Demo> = {
  title: 'Components/Expansion',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  argTypes: {
    hideToggle: {
      description: 'Hide the trailing chevron on every header.',
      control: 'boolean',
    },
    disabled: {
      description: 'Disable the first panel.',
      control: 'boolean',
    },
    showDescription: {
      description: 'Toggle `<mat-panel-description>` (secondary subtitle line on the header).',
      control: 'boolean',
    },
    showActionRow: {
      description: 'Toggle the bottom `<mat-action-row>` on the first panel.',
      control: 'boolean',
    },
    multi: {
      description: 'Allow several panels to be open at once.',
      control: 'boolean',
    },
  },
  args: {
    hideToggle: false,
    disabled: false,
    showDescription: true,
    showActionRow: true,
    multi: false,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Collapsible disclosure surface. Use `<mat-expansion-panel>` standalone or wrap several in `<mat-accordion>` for a group. Flip the controls panel to test the variants.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
