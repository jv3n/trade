import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SourceCategory = 'rss' | 'market' | 'macro' | 'crypto';

export interface DataSource {
  id: string;
  name: string;
  description: string;
  url: string;
  category: SourceCategory;
  free: boolean;
  enabled: boolean;
  requiresApiKey: boolean;
}

const DEFAULT_SOURCES: DataSource[] = [
  // RSS / Presse
  { id: 'reuters-business', name: 'Reuters Business', description: 'Actualité économique mondiale', url: 'https://feeds.reuters.com/reuters/businessNews', category: 'rss', free: true, enabled: true, requiresApiKey: false },
  { id: 'reuters-markets', name: 'Reuters Markets', description: 'Marchés financiers', url: 'https://feeds.reuters.com/reuters/marketsNews', category: 'rss', free: true, enabled: true, requiresApiKey: false },
  { id: 'bfm-bourse', name: 'BFM Bourse', description: 'Actualité bourse française', url: 'https://bfmbusiness.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/', category: 'rss', free: true, enabled: true, requiresApiKey: false },
  { id: 'lemonde-eco', name: 'Le Monde Économie', description: 'Couverture macro française', url: 'https://www.lemonde.fr/economie/rss_full.xml', category: 'rss', free: true, enabled: false, requiresApiKey: false },
  { id: 'cnbc-markets', name: 'CNBC Markets', description: 'Actualité marchés US', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258', category: 'rss', free: true, enabled: false, requiresApiKey: false },
  { id: 'marketwatch', name: 'MarketWatch', description: 'Headlines temps réel US', url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines', category: 'rss', free: true, enabled: false, requiresApiKey: false },
  { id: 'les-echos', name: 'Les Echos', description: 'Finance et économie française', url: 'https://www.lesechos.fr/rss/rss_finance.xml', category: 'rss', free: false, enabled: false, requiresApiKey: false },
  { id: 'seeking-alpha', name: 'Seeking Alpha', description: 'Analyses approfondies d\'actions', url: 'https://seekingalpha.com/feed.xml', category: 'rss', free: false, enabled: false, requiresApiKey: false },

  // Données de marché
  { id: 'yahoo-finance', name: 'Yahoo Finance', description: 'Cours, historique, fondamentaux — aucune clé requise', url: 'https://finance.yahoo.com', category: 'market', free: true, enabled: true, requiresApiKey: false },
  { id: 'stooq', name: 'Stooq', description: 'Cours historiques EOD, couverture mondiale', url: 'https://stooq.com', category: 'market', free: true, enabled: true, requiresApiKey: false },
  { id: 'alpha-vantage', name: 'Alpha Vantage', description: 'Cours + indicateurs techniques', url: 'https://www.alphavantage.co', category: 'market', free: true, enabled: false, requiresApiKey: true },
  { id: 'finnhub', name: 'Finnhub', description: 'Cours temps réel, news, fondamentaux', url: 'https://finnhub.io', category: 'market', free: true, enabled: false, requiresApiKey: true },
  { id: 'polygon', name: 'Polygon.io', description: 'Cours, options, crypto — très complet', url: 'https://polygon.io', category: 'market', free: true, enabled: false, requiresApiKey: true },
  { id: 'twelve-data', name: 'Twelve Data', description: 'Cours, ETF, indicateurs techniques', url: 'https://twelvedata.com', category: 'market', free: true, enabled: false, requiresApiKey: true },

  // Macro-économique
  { id: 'fred', name: 'FRED (Federal Reserve)', description: 'Indicateurs US : PIB, inflation, taux directeurs…', url: 'https://fred.stlouisfed.org', category: 'macro', free: true, enabled: true, requiresApiKey: true },
  { id: 'bce', name: 'BCE', description: 'Indicateurs zone euro', url: 'https://data.ecb.europa.eu', category: 'macro', free: true, enabled: true, requiresApiKey: false },
  { id: 'world-bank', name: 'Banque Mondiale', description: 'Indicateurs économiques mondiaux', url: 'https://data.worldbank.org', category: 'macro', free: true, enabled: false, requiresApiKey: false },
  { id: 'insee', name: 'INSEE', description: 'Statistiques économiques françaises', url: 'https://api.insee.fr', category: 'macro', free: true, enabled: false, requiresApiKey: true },

  // Crypto
  { id: 'coingecko', name: 'CoinGecko', description: 'Cours, market cap, volumes crypto', url: 'https://www.coingecko.com/api', category: 'crypto', free: true, enabled: true, requiresApiKey: false },
  { id: 'binance', name: 'Binance Public API', description: 'Cours temps réel crypto', url: 'https://binance-docs.github.io/apidocs/', category: 'crypto', free: true, enabled: false, requiresApiKey: false },
  { id: 'coinmarketcap', name: 'CoinMarketCap', description: 'Cours et market cap crypto', url: 'https://coinmarketcap.com/api/', category: 'crypto', free: true, enabled: false, requiresApiKey: true },
];

const CATEGORY_LABELS: Record<SourceCategory, string> = {
  rss: 'Presse & Flux RSS',
  market: 'Données de marché',
  macro: 'Indicateurs macro-économiques',
  crypto: 'Crypto',
};

const CATEGORY_ORDER: SourceCategory[] = ['rss', 'market', 'macro', 'crypto'];

@Component({
  selector: 'app-settings',
  imports: [CommonModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  sources = signal<DataSource[]>(DEFAULT_SOURCES);

  categories = CATEGORY_ORDER;
  categoryLabels = CATEGORY_LABELS;

  sourcesByCategory(category: SourceCategory): DataSource[] {
    return this.sources().filter(s => s.category === category);
  }

  enabledCount(category: SourceCategory): number {
    return this.sourcesByCategory(category).filter(s => s.enabled).length;
  }

  toggle(id: string) {
    this.sources.update(list =>
      list.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
    );
  }
}
