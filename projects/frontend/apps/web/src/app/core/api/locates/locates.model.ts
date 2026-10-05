/**
 * Locates **domain** types (#602) — shares located before a short, paid whether or not the trade
 * happens. A cost on a (day, ticker), matched to the trades of that day by ticker (#625). The cost is shares × price per share, computed by the backend. The wire format (ISO date
 * strings) is owned by the HTTP adapter.
 */
export interface Locate {
  id: string;
  tradingDate: Date;
  ticker: string;
  shares: number;
  pricePerShare: number;
  /** The share's price when the locate was taken — what the locate is weighed against. */
  stockPrice: number | null;
  cost: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A new locate — the same from Today, the account or the trade sheet. */
export interface LocateInput {
  tradingDate: Date;
  ticker: string;
  shares: number;
  pricePerShare: number;
  stockPrice: number | null;
  note: string | null;
}

/** Correcting a locate : the day and the ticker do not move. */
export interface LocateUpdate {
  shares: number;
  pricePerShare: number;
  stockPrice: number | null;
  note: string | null;
}
