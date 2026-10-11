import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import { StbSkeletonCard, StbSkeletonKpiRow, StbSkeletonTable } from './skeleton-patterns';
import { StbSkeleton, type StbSkeletonVariant } from './skeleton.component';

interface SkeletonArgs {
  variant: StbSkeletonVariant;
  width: string;
  height: string;
  count: number;
}

const meta: Meta<SkeletonArgs> = {
  title: 'Components/Skeleton',
  decorators: [
    moduleMetadata({
      imports: [StbSkeleton, StbSkeletonTable, StbSkeletonKpiRow, StbSkeletonCard],
    }),
  ],
  argTypes: {
    variant: {
      description: 'The shape : a line of text, a thinner line, a block, a circle, a chip.',
      control: 'inline-radio',
      options: ['text', 'line', 'block', 'circle', 'chip'],
    },
    width: { description: 'CSS width — a number in the template is pixels.', control: 'text' },
    height: { description: 'CSS height, over the variant’s own.', control: 'text' },
    count: {
      description: 'Stacked blocks, for paragraph lines.',
      control: { type: 'number', min: 1 },
    },
  },
  args: { variant: 'text', width: '240px', height: '', count: 1 },
  render: (args) => ({
    props: args,
    template: `<ui-skeleton [variant]="variant" [width]="width || null" [height]="height || null" [count]="count" />`,
  }),
};
export default meta;

type Story = StoryObj<SkeletonArgs>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => ({
    template: `
      <div style="display: grid; gap: 16px; max-width: 360px">
        <ui-skeleton width="60%" />
        <ui-skeleton variant="line" [count]="3" />
        <ui-skeleton variant="block" />
        <ui-skeleton variant="circle" />
        <ui-skeleton variant="chip" />
      </div>
    `,
  }),
};

export const Table: Story = {
  render: () => ({
    props: {
      columns: [
        { label: 'Date' },
        { label: 'Ticker', variant: 'ticker' },
        { label: 'Pattern' },
        { label: 'Trades', variant: 'numeric' },
        { label: 'P&L ($ US)', variant: 'numeric' },
        { label: '', variant: 'actions' },
      ],
    },
    template: `<ui-skeleton-table [columns]="columns" label="Loading…" />`,
  }),
};

export const KpiRow: Story = {
  render: () => ({ template: `<ui-skeleton-kpi-row label="Loading…" />` }),
};

/**
 * Each ghost row above the real row it stands for, at 4, 5 and 6 figures : the tiles must line up
 * and share their height, or the page jumps when the figures land (#616). jsdom measures no
 * heights, so this is where a regression shows.
 */
export const KpiRowAgainstReal: Story = {
  render: () => ({
    props: {
      rows: [
        { count: 4, modifier: '' },
        { count: 5, modifier: 'kpi-row--five' },
        { count: 6, modifier: 'kpi-row--six' },
      ],
      figures: [
        { label: 'Realized P&L', value: '+1,240.50', sub: '12 trades' },
        { label: 'Win rate', value: '58 %', sub: '7 winners' },
        { label: 'Avg win', value: '+312.40', sub: 'per winning trade' },
        { label: 'Avg loss', value: '−148.20', sub: 'per losing trade' },
        { label: 'Profit factor', value: '1.84', sub: 'wins ÷ losses' },
        { label: 'After 11 am', value: '−96.10', sub: '3 trades' },
      ],
    },
    template: `
      <div style="display: grid; gap: 32px">
        @for (row of rows; track row.count) {
          <div style="display: grid; gap: 8px">
            <ui-skeleton-kpi-row [count]="row.count" />
            <section class="kpi-row" [class]="row.modifier">
              @for (f of figures.slice(0, row.count); track f.label) {
                <div class="card kpi">
                  <div class="kpi__label">{{ f.label }}</div>
                  <div class="kpi__value">{{ f.value }}</div>
                  <div class="kpi__sub">{{ f.sub }}</div>
                </div>
              }
            </section>
          </div>
        }
      </div>
    `,
  }),
};

export const Card: Story = {
  render: () => ({
    template: `<div style="max-width: 480px"><ui-skeleton-card label="Loading…" /></div>`,
  }),
};

/** Reduced motion : no sweep, a still fill. Storybook can't switch the OS setting, so a class does. */
export const ReducedMotion: Story = {
  render: () => ({
    template: `
      <div class="stb-skeleton-still" style="display: grid; gap: 16px">
        <ui-skeleton-kpi-row label="Loading…" />
        <div style="max-width: 480px"><ui-skeleton-card label="Loading…" /></div>
      </div>
    `,
  }),
};
