import { Component, inject } from '@angular/core';
import {
  MatSnackBar,
  MatSnackBarHorizontalPosition,
  MatSnackBarVerticalPosition,
} from '@angular/material/snack-bar';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbButtonModule } from '../button/button.module';
import { StbSnackBarModule } from './snack-bar.module';

type HPos = MatSnackBarHorizontalPosition;
type VPos = MatSnackBarVerticalPosition;
type Variant = 'default' | 'error' | 'success';

interface SnackBarArgs {
  variant: Variant;
  message: string;
  action: string;
  durationMs: number;
  horizontal: HPos;
  vertical: VPos;
}

@Component({
  selector: 'ui-snack-bar-demo',
  standalone: true,
  imports: [StbButtonModule, StbSnackBarModule],
  template: ` <button mat-flat-button type="button" (click)="show()">Show snack-bar</button> `,
})
class Demo implements SnackBarArgs {
  private readonly snackBar = inject(MatSnackBar);

  variant: Variant = 'default';
  message = 'Trade saved.';
  action = 'Undo';
  durationMs = 3000;
  horizontal: HPos = 'center';
  vertical: VPos = 'bottom';

  show(): void {
    const panelClass = this.variant === 'default' ? undefined : `stb-snack-bar--${this.variant}`;
    this.snackBar.open(this.message, this.action || undefined, {
      duration: this.durationMs,
      horizontalPosition: this.horizontal,
      verticalPosition: this.vertical,
      panelClass,
    });
  }
}

const meta: Meta<Demo> = {
  title: 'Components/Snack-bar',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  argTypes: {
    variant: {
      description:
        '`default` uses the high-contrast inverted pair. `error` (red) and `success` (green) apply via the `panelClass` option of `MatSnackBar.open()`.',
      control: 'inline-radio',
      options: ['default', 'error', 'success'],
    },
    message: { control: 'text' },
    action: {
      description: 'Action button label. Leave blank to drop the button.',
      control: 'text',
    },
    durationMs: {
      description: 'Auto-dismiss delay in milliseconds. `0` = stays until manually dismissed.',
      control: { type: 'number', min: 0, step: 500 },
    },
    horizontal: {
      control: 'inline-radio',
      options: ['start', 'center', 'end', 'left', 'right'],
    },
    vertical: {
      control: 'inline-radio',
      options: ['top', 'bottom'],
    },
  },
  args: {
    variant: 'default',
    message: 'Trade saved.',
    action: 'Undo',
    durationMs: 3000,
    horizontal: 'center',
    vertical: 'bottom',
  },
  parameters: {
    docs: {
      description: {
        component:
          'Ephemeral notification — opened imperatively via the `MatSnackBar` service. Use the controls panel to flip variant / message / action label / duration / position, then click the demo button to fire the snack-bar.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
