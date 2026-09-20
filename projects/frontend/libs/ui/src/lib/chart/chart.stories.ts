import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import { StbAreaChart, type AreaChartPoint } from './area-chart.component';

interface AreaChartArgs {
  points: readonly AreaChartPoint[];
  unit: string;
  height: number;
}

/**
 * Builds a plausible balance curve : a slow drift up with daily noise, so the story shows what the
 * chart does with real-looking data rather than a straight line.
 */
function series(days: number, start: number, drift: number, noise: number): AreaChartPoint[] {
  const out: AreaChartPoint[] = [];
  let value = start;
  const first = new Date(2026, 8, 1);
  for (let i = 0; i < days; i++) {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    // Deterministic pseudo-noise — a story that reshuffles on every render is unreadable.
    value += drift + Math.sin(i * 1.7) * noise;
    out.push({
      x: date.getTime(),
      y: Math.round(value * 100) / 100,
      label: date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    });
  }
  return out;
}

const meta: Meta<AreaChartArgs> = {
  title: 'Components/Chart',
  decorators: [moduleMetadata({ imports: [StbAreaChart] })],
  argTypes: {
    points: {
      description: 'The series : `{ x: epoch ms, y: value, label: tooltip caption }`.',
      control: 'object',
    },
    unit: {
      description: 'Appended to the value in the tooltip.',
      control: 'text',
    },
    height: {
      description: 'Drawing height in pixels — a chart has no intrinsic size.',
      control: { type: 'range', min: 80, max: 480, step: 20 },
    },
  },
  args: {
    points: series(20, 26000, 70, 180),
    unit: ' $',
    height: 200,
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="max-width: 900px; padding: 18px 20px; background: var(--color-surface);
                  border: 1px solid var(--color-border); border-radius: var(--radius-lg);">
        <ui-area-chart [points]="points" [unit]="unit" [height]="height" />
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        component: [
          'Charts are rendered with **ECharts**, wired once in the lib : the app never imports the',
          'library and never writes an option object. `ui-chart` owns the instance, the resize and',
          'the theme ; each chart type wraps it and takes domain inputs — here, points and a unit.',
          '',
          'The palette is read from the design tokens and **follows the theme live** : flip the',
          'Theme control in the toolbar and the curve repaints without a reload.',
        ].join('\n'),
      },
    },
  },
};

export default meta;
type Story = StoryObj<AreaChartArgs>;

/** The account balance curve — the first consumer of the chart. */
export const Area: Story = {};

/** A losing stretch : the fill and the line follow the accent whatever the direction. */
export const Downtrend: Story = {
  args: { points: series(20, 28000, -90, 200) },
};

/** Under two points there is no curve to draw : the host renders nothing. */
export const NotEnoughData: Story = {
  args: { points: series(1, 26000, 0, 0) },
};
