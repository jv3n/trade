/**
 * Locates **domain** types (#602) — shares located before a short, paid whether or not the trade
 * happens. The cost is shares × price per share, computed by the backend. The wire format (ISO date
 * strings) is owned by the HTTP adapter.
 */
export interface Locate {
  id: string;
  tradingDate: Date;
  ticker: string;
  shares: number;
  pricePerShare: number;
  cost: number;
  note: string | null;
  /** The candidate it was taken on — `null` for a locate typed on its own, or once it is deleted. */
  candidateId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A new locate. Taken on a candidate, the day and the ticker are the candidate's and the price
 * defaults to its locate quote ; with no candidate, the day, the ticker and the price are required.
 */
export interface LocateInput {
  shares: number;
  pricePerShare: number | null;
  candidateId: string | null;
  tradingDate: Date | null;
  ticker: string | null;
  note: string | null;
}

/** Correcting a locate : the day, the ticker and the candidate do not move. */
export interface LocateUpdate {
  shares: number;
  pricePerShare: number;
  note: string | null;
}
