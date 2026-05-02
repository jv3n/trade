import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MarketRepository, TickerSnapshot } from '../../core/market.repository';

interface Point {
  x: number;
  y: number;
}

@Component({
  selector: 'app-ticker',
  imports: [CommonModule, RouterLink, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './ticker.html',
  styleUrl: './ticker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TickerPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly marketRepository = inject(MarketRepository);

  symbol = signal<string>('');
  loading = signal(false);
  error = signal<string | null>(null);
  snapshot = signal<TickerSnapshot | null>(null);

  // ---- Derived state for the chart ----

  /** Width / height units of the viewBox. The SVG scales to its container. */
  readonly chartWidth = 800;
  readonly chartHeight = 240;
  private readonly chartPadding = 8;

  closes = computed<Point[]>(() => {
    const bars = this.snapshot()?.bars ?? [];
    if (bars.length < 2) return [];
    const closes = bars.map((b) => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const w = this.chartWidth - this.chartPadding * 2;
    const h = this.chartHeight - this.chartPadding * 2;
    return closes.map((c, i) => ({
      x: this.chartPadding + (i / (closes.length - 1)) * w,
      y: this.chartPadding + (1 - (c - min) / range) * h,
    }));
  });

  pricePath = computed(() => {
    const pts = this.closes();
    if (pts.length === 0) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
  });

  // ---- Indicator helpers (used in template for color bands) ----

  rsiClass = computed(() => {
    const r = this.snapshot()?.indicators?.rsi14;
    if (r === null || r === undefined) return '';
    if (r >= 70) return 'warning';
    if (r <= 30) return 'warning';
    return '';
  });

  drawdownClass = computed(() => {
    const d = this.snapshot()?.indicators?.drawdownFrom52wHigh;
    if (d === null || d === undefined) return '';
    if (d <= -20) return 'danger';
    if (d >= -5) return 'success';
    return '';
  });

  perfClass(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    if (value > 0) return 'success';
    if (value < 0) return 'danger';
    return '';
  }

  signed(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
  }

  private errorMessage(err: { status?: number } | undefined, symbol: string): string {
    switch (err?.status) {
      case 404:
        return `Ticker introuvable : ${symbol}`;
      case 503:
        return 'Données de marché momentanément indisponibles (rate-limit Yahoo). Réessaie dans quelques minutes.';
      default:
        return 'Erreur lors du chargement du ticker';
    }
  }

  // ---- Lifecycle ----

  ngOnInit(): void {
    const s = this.route.snapshot.paramMap.get('symbol');
    if (!s) {
      this.error.set("Symbole manquant dans l'URL");
      return;
    }
    this.symbol.set(s);
    this.load(s);
  }

  load(symbol: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.marketRepository.getTicker(symbol).subscribe({
      next: (snap) => {
        this.snapshot.set(snap);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(this.errorMessage(err, symbol));
        this.loading.set(false);
      },
    });
  }
}
