import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import { StbBarChart, type BarBucket, type BarSeries } from './bar-chart.component';

interface BarChartArgs {
  series: readonly BarSeries[];
  buckets: readonly BarBucket[];
  format: (value: number) => string;
  height: number;
}

/** The app passes its own language's ; the playground formats in English. */
function usd(value: number): string {
  const amount = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${amount} USD`;
}

/** The account's flow, as the « Flux du compte » report stacks it (#685). */
const FLOW: readonly BarSeries[] = [
  { key: 'winning', label: 'Winning trades', tone: 'gain' },
  { key: 'losing', label: 'Losing trades', tone: 'loss' },
  { key: 'fees', label: 'Fees — locates and corrections', tone: 'cost' },
  { key: 'deposits', label: 'Deposits', tone: 'neutral' },
  { key: 'withdrawals', label: 'Withdrawals', tone: 'neutral' },
];

/** Weeks from 15/06, each a tuple in the order of [FLOW]. */
function weeks(rows: readonly (readonly number[])[]): BarBucket[] {
  return rows.map((row, i) => {
    const start = new Date(2026, 5, 15 + i * 7);
    const label = start.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
    return {
      label,
      title: `Week of ${label}`,
      values: Object.fromEntries(FLOW.map((s, j) => [s.key, row[j] ?? 0])),
    };
  });
}

const MIXED = weeks([
  [280, -120, -95, 0, 0],
  [0, -310, -140, 0, 0],
  [515, -60, -188.2, 0, 0],
  [190, -240, -110, 5000, 0],
  [640, -90, -205, 0, 0],
  [120, -380, -155, 0, 0],
  [455, -140, -190, 0, 0],
  [210, -95, -85, 0, -1500],
  [0, 0, 0, 0, 0],
  [330, -410, -230, 0, 0],
]);

const meta: Meta<BarChartArgs> = {
  title: 'Components/Chart/Bar',
  decorators: [moduleMetadata({ imports: [StbBarChart] })],
  argTypes: {
    series: {
      description: 'The stacked series : `{ key, label, tone: gain | loss | cost | neutral }`.',
      control: 'object',
    },
    buckets: {
      description: 'One bar each : `{ label, title, values: { [series key]: signed amount } }`.',
      control: 'object',
    },
    format: {
      description: 'Formats an amount in the tooltip — required, the app passes its locale.',
      control: false,
    },
    height: {
      description: 'Drawing height in pixels.',
      control: { type: 'range', min: 120, max: 480, step: 20 },
    },
  },
  args: { series: FLOW, buckets: MIXED, format: usd, height: 260 },
  render: (args) => ({
    props: args,
    template: `
      <div style="max-width: 900px; padding: 18px 20px; background: var(--color-surface);
                  border: 1px solid var(--color-border); border-radius: var(--radius-lg);">
        <ui-bar-chart [series]="series" [buckets]="buckets" [format]="format" [height]="height" />
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        component: [
          'Stacked, **signed** bars around a zero line : positives pile above, negatives below.',
          'Each series takes the colour of its **tone** — green / red for outcomes, amber for costs,',
          'neutral for fund movements. The net of each bar is a hole ; a bar where nothing moved is',
          'a flat tick on the line. Hover a bar for what moved in it and its net.',
        ].join('\n'),
      },
    },
  },
};

export default meta;
type Story = StoryObj<BarChartArgs>;

/** Both sides at once, a 5 000 $ deposit dwarfing the trading, and an empty week. */
export const Mixed: Story = {};

/** Nothing below zero : the zero line sits at the bottom, the bars still start on it. */
export const PositiveOnly: Story = {
  args: {
    buckets: weeks([
      [280, 0, 0, 0, 0],
      [515, 0, 0, 0, 0],
      [0, 0, 0, 1000, 0],
      [640, 0, 0, 0, 0],
      [120, 0, 0, 0, 0],
    ]),
  },
};

/** Nothing above zero : the zero line sits at the top, the bars hang from it. */
export const NegativeOnly: Story = {
  args: {
    buckets: weeks([
      [0, -120, -95, 0, 0],
      [0, -310, -140, 0, 0],
      [0, -60, -188.2, 0, 0],
      [0, 0, 0, 0, -1500],
      [0, -90, -205, 0, 0],
    ]),
  },
};

/** Two bars — a half-year by quarter : the bars widen to the room, up to their cap. */
export const FewBars: Story = {
  args: {
    buckets: weeks([
      [1840, -1210, -720, 5000, 0],
      [2310, -980, -655, 0, -1500],
    ]).map((b, i) => ({ ...b, label: `Q${i + 2} 2026`, title: `Q${i + 2} 2026` })),
  },
};

/** Trades and fees only — the « Trading seul » view, on its own scale. */
export const TradingOnly: Story = {
  args: { series: FLOW.slice(0, 3) },
};
