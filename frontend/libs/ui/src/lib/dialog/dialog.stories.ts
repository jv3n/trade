import { Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbButtonModule } from '../button';
import { StbDialogModule } from './dialog.module';

@Component({
  selector: 'ui-dialog-sample',
  standalone: true,
  imports: [StbDialogModule, StbButtonModule],
  template: `
    <h2 mat-dialog-title>Confirm</h2>
    <mat-dialog-content>Are you sure you want to proceed ?</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close>Cancel</button>
      <button mat-flat-button mat-dialog-close>Confirm</button>
    </mat-dialog-actions>
  `,
})
class DialogSample {}

@Component({
  selector: 'ui-dialog-demo',
  standalone: true,
  imports: [StbDialogModule, StbButtonModule],
  template: `
    <div>
      <button mat-flat-button type="button" (click)="open()">Open dialog</button>
    </div>
  `,
})
class Demo {
  private readonly dialog = inject(MatDialog);
  open(): void {
    this.dialog.open(DialogSample);
  }
}

const meta: Meta<Demo> = {
  title: 'Components/Dialog',
  component: Demo,
  decorators: [moduleMetadata({ imports: [DialogSample] })],
  parameters: {
    docs: {
      description: {
        component:
          'Modal dialog — use `MatDialog.open(ContentComponent, { width, ... })` to launch. The companion `add-trade-dialog` in `apps/web` shows the full pattern (custom width, autoFocus, return value).',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
