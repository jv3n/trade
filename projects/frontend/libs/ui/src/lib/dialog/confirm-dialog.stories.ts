import { Component, inject, input, signal } from '@angular/core';
import { Meta, StoryObj } from '@storybook/angular';
import { StbButtonModule } from '../button';
import { StbConfirmDialogData } from './confirm-dialog';
import { StbConfirm } from './stb-confirm';

@Component({
  selector: 'ui-confirm-dialog-demo',
  imports: [StbButtonModule],
  template: `
    <button mat-flat-button type="button" (click)="open()">Open confirmation</button>
    <p class="result">Last result : {{ result() ?? '—' }}</p>
  `,
  styles: `
    .result {
      margin-top: 12px;
      color: var(--color-text-muted);
    }
  `,
})
class ConfirmDialogDemo {
  private readonly confirm = inject(StbConfirm);

  readonly data = input.required<StbConfirmDialogData>();
  protected readonly result = signal<boolean | null>(null);

  open(): void {
    this.confirm.open(this.data()).subscribe((confirmed) => this.result.set(confirmed));
  }
}

const meta: Meta<ConfirmDialogDemo> = {
  title: 'Components/Confirm dialog',
  component: ConfirmDialogDemo,
  parameters: {
    docs: {
      description: {
        component:
          'Confirmation modal for every action that creates or deletes something. Open it with `StbConfirm.open(data)` — emits `true` on confirm, `false` on Cancel / Esc / backdrop. Texts arrive already translated. Switch the Theme toolbar to check both palettes.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<ConfirmDialogDemo>;

export const Default: Story = {
  args: {
    data: {
      title: 'Promote KTTA to a stat?',
      message:
        'The stat takes over every candidate field (pattern, gap, push, float, volume, locate, note). You will complete it after the 4 pm close.',
      confirmLabel: 'Promote to stat',
      cancelLabel: 'Cancel',
    },
  },
};

export const Danger: Story = {
  args: {
    data: {
      title: 'Delete the KTTA trade of 09/17?',
      message:
        'Permanent: executions, post-mortem and chart capture are deleted, and the +$291.85 movement disappears from the account. The stat of the day is kept.',
      confirmLabel: 'Delete the trade',
      cancelLabel: 'Cancel',
      variant: 'danger',
    },
  },
};
