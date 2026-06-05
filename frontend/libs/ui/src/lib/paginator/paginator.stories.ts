import { Component } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbPaginatorModule } from './paginator.module';

interface PaginatorArgs {
  length: number;
  pageSize: number;
  pageSizeOptions: string;
  hidePageSize: boolean;
  showFirstLastButtons: boolean;
  disabled: boolean;
}

@Component({
  selector: 'ui-paginator-demo',

  imports: [StbPaginatorModule],
  template: `
    <mat-paginator
      [length]="length"
      [pageSize]="pageSize"
      [pageSizeOptions]="parsedOptions()"
      [hidePageSize]="hidePageSize"
      [showFirstLastButtons]="showFirstLastButtons"
      [disabled]="disabled"
      (page)="onPage($event)"
    />
    <p>
      @if (lastEvent) {
        Last event — pageIndex : {{ lastEvent.pageIndex }}, pageSize : {{ lastEvent.pageSize }}
      } @else {
        Click the arrows or change the page-size dropdown above.
      }
    </p>
  `,
})
class Demo implements PaginatorArgs {
  length = 42;
  pageSize = 10;
  pageSizeOptions = '5, 10, 25, 50';
  hidePageSize = false;
  showFirstLastButtons = true;
  disabled = false;
  lastEvent: PageEvent | null = null;

  parsedOptions(): number[] {
    return this.pageSizeOptions
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  onPage(event: PageEvent): void {
    this.lastEvent = event;
  }
}

const meta: Meta<Demo> = {
  title: 'Components/Paginator',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  argTypes: {
    length: {
      description: 'Total number of items across all pages.',
      control: { type: 'number', min: 0, step: 1 },
    },
    pageSize: {
      description: 'Number of items shown per page (initial value of the dropdown).',
      control: { type: 'number', min: 1, step: 1 },
    },
    pageSizeOptions: {
      description: 'Comma-separated options shown in the page-size dropdown.',
      control: 'text',
    },
    hidePageSize: {
      description: 'Hide the "Items per page" dropdown.',
      control: 'boolean',
    },
    showFirstLastButtons: {
      description: 'Show the « first » and » last » navigation arrows alongside prev / next.',
      control: 'boolean',
    },
    disabled: { control: 'boolean' },
  },
  args: {
    length: 42,
    pageSize: 10,
    pageSizeOptions: '5, 10, 25, 50',
    hidePageSize: false,
    showFirstLastButtons: true,
    disabled: false,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Page navigation control. Pairs with `<mat-table>` (or any list) — wire `length` / `pageSize` / `pageSizeOptions` to your data source state, listen to `(page)` to refetch / slice. Use the controls panel to flip the visible affordances and the dropdown contents.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
