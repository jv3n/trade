import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import {
  StbCandleChart,
  type CandleBar,
  type CandleLeg,
  type CandleLine,
  type CandleMark,
  type CandleShade,
} from './candle-chart.component';

interface CandleChartArgs {
  bars: readonly CandleBar[];
  marks: readonly CandleMark[];
  legs: readonly CandleLeg[];
  line: CandleLine | null;
  shades: readonly CandleShade[];
  height: number;
}

const label = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/**
 * A GUS session in 1-min bars from the open : a push to ~2.20 within ten minutes, then the fall to
 * a ~1.52 Sink. Deterministic — a story that reshuffles on every render is unreadable.
 */
function session(): CandleBar[] {
  const out: CandleBar[] = [];
  let close = 1.9;
  for (let m = 570; m < 960; m++) {
    const target = m < 581 ? 1.9 + (m - 570) * 0.027 : m < 625 ? 2.2 - (m - 581) * 0.0155 : 1.55;
    const open = close;
    close = target + Math.sin(m * 1.3) * 0.012;
    out.push({
      label: label(m),
      open,
      close,
      high: Math.max(open, close) + Math.abs(Math.sin(m)) * 0.01,
      low: Math.min(open, close) - Math.abs(Math.cos(m)) * 0.01,
      volume: Math.round((m < 600 ? 90_000 : 25_000) * (1 + Math.abs(Math.sin(m * 0.7)))),
    });
  }
  return out;
}

const meta: Meta<CandleChartArgs> = {
  title: 'Components/Chart/Candles',
  decorators: [moduleMetadata({ imports: [StbCandleChart] })],
  argTypes: {
    bars: { description: 'The candles : `{ label, open, high, low, close, volume }`.' },
    marks: {
      description:
        'Points on their candle : `{ short, title, at, price, tone, above, towards? }` — `warn` ' +
        'with `towards` draws a point off its candle, with a leader to its edge.',
    },
    legs: {
      description:
        'Lines between the points, hovered for their move : `{ title, from, to, tone }` — `warn` ' +
        'for a leg touching a point off its candle.',
    },
    line: { description: 'A dashed reference — `{ price, label }`.' },
    shades: { description: 'Stretches shaded, from one bar label to another.' },
    height: { control: { type: 'range', min: 200, max: 480, step: 20 } },
  },
  args: {
    bars: session(),
    legs: [
      {
        title: 'Open → Push · +15.8% · 11 min',
        from: { at: '09:30', price: 1.9 },
        to: { at: '09:40', price: 2.2 },
        tone: 'accent',
      },
    ],
    marks: [
      {
        short: 'O',
        title: 'Open · 09:30 · 1.90',
        at: '09:30',
        price: 1.9,
        tone: 'accent',
        above: false,
      },
      {
        short: 'P',
        title: 'Push · 09:41 · 2.20',
        at: '09:41',
        price: 2.2,
        tone: 'accent',
        above: true,
      },
      {
        short: 'S',
        title: 'Sink · 10:25 · 1.52',
        at: '10:25',
        price: 1.52,
        tone: 'accent',
        above: false,
      },
    ],
    line: null,
    shades: [],
    height: 320,
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="max-width: 900px; padding: 18px 20px; background: var(--color-surface);
                  border: 1px solid var(--color-border); border-radius: var(--radius-lg);">
        <ui-candle-chart [bars]="bars" [marks]="marks" [line]="line" [shades]="shades"
                         [height]="height" />
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        component: [
          "A day's candles with their volume, for a stat read against its bars (#784). **Green up,",
          'red down**, the volume in its candle colour — the one exception to the colour rule, as on',
          'every trading tool (#804). The marks are the accent ; a point off its candle is amber, with a',
          'dashed leader to the candle. The wheel zooms the time, the slider beside the prices the price.',
        ].join('\n'),
      },
    },
  },
};

export default meta;
type Story = StoryObj<CandleChartArgs>;

/** A GUS session, its three OPS points on their candles. */
export const Session: Story = {};

/** The Push typed at 2.40 when its candle tops at ~2.20 : amber, a leader down to the candle. */
export const PointOffItsCandle: Story = {
  args: {
    marks: [
      {
        short: 'O',
        title: 'Open · 09:30 · 1.90',
        at: '09:30',
        price: 1.9,
        tone: 'accent',
        above: false,
      },
      {
        short: 'P',
        title: 'Push · 09:41 · 2.40',
        at: '09:41',
        price: 2.4,
        tone: 'warn',
        above: true,
        towards: 2.2,
      },
    ],
  },
};
