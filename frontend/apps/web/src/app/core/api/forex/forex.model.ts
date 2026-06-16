/**
 * Foreign-exchange **domain** type. The wire format (ISO date string) is owned by the HTTP adapter ;
 * consumers stay in `Date` land.
 */

/** Latest FX reference rate : 1 [base] = [rate] [quote], published on [asOf] (ECB business day). */
export interface ForexRate {
  base: string;
  quote: string;
  rate: number;
  asOf: Date;
}
