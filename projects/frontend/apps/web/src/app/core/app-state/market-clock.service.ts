import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { isSameDay } from 'date-fns';
import { marketDay } from '../../shared/market-time/market-time';

/**
 * The one source of the trading day. Read again when the tab comes back : left open overnight, a
 * page would otherwise write to yesterday. [today] only changes when the day does, so a resource
 * keyed on it does not reload on every return to the tab.
 */
@Injectable({ providedIn: 'root' })
export class MarketClock {
  private readonly document = inject(DOCUMENT);
  private readonly instant = signal(new Date());

  readonly now = this.instant.asReadonly();
  readonly today = computed(() => marketDay(this.instant()), { equal: isSameDay });

  constructor() {
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible') this.instant.set(new Date());
    });
  }
}
