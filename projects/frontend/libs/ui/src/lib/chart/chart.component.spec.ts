import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as echarts from 'echarts/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StbChart, StbChartOptionFactory } from './chart.component';

/**
 * The ECharts base every chart is built on, against a live instance — jsdom's canvas is inert
 * (`test-setup.ts`) but ECharts runs. What is pinned is how an option reaches the instance :
 *
 *  - **A change of the series set hides the tooltip** (#751) — a series removed under an open
 *    tooltip left it pointing past the new list ; ECharts showed it again on the next tick, threw,
 *    and kept listing the series gone. A data change on the same series keeps the tooltip.
 */
/** One bar per name, each worth [value]. */
function bars(names: string[], value = 312): StbChartOptionFactory {
  return () => ({
    xAxis: { type: 'category', data: ['14/09'] },
    yAxis: { type: 'value' },
    tooltip: { trigger: 'axis' },
    series: names.map((name) => ({ type: 'bar', name, data: [value] })),
  });
}

@Component({
  imports: [StbChart],
  template: `<ui-chart [optionFactory]="option()" />`,
})
class Host {
  readonly option = signal(bars(['Winning trades', 'Deposits']));
}

describe('StbChart', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const canvas = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.chart-canvas',
    );
    const instance = echarts.getInstanceByDom(canvas!)!;
    return { fixture, dispatch: vi.spyOn(instance, 'dispatchAction') };
  }

  // Unchecking « Dépôts » on the report with the tooltip up (#751, GlitchTip 8605500).
  it('hides the tooltip when a series is taken off', async () => {
    const { fixture, dispatch } = await render();

    fixture.componentInstance.option.set(bars(['Winning trades']));
    await fixture.whenStable();

    expect(dispatch).toHaveBeenCalledWith({ type: 'hideTip' });
  });

  it('keeps the tooltip when only the figures change', async () => {
    const { fixture, dispatch } = await render();

    // Another period : the same series, other figures.
    fixture.componentInstance.option.set(bars(['Winning trades', 'Deposits'], 405));
    await fixture.whenStable();

    expect(dispatch).not.toHaveBeenCalled();
  });
});
