/**
 * Shape returned by [buildFilterWindow] — half-open `[from, to)` interval in ISO-instant strings
 * plus an optional `promptId`. Structurally compatible with both `NarrativeObservationsFilter` and
 * `NarrativeBiasFilter` (same `from / to / promptId` triple), so the helper serves both pages
 * without coupling to either repository's interface.
 */
export interface FilterWindow {
  from?: string;
  to?: string;
  promptId?: string;
}

/**
 * Translates raw filter signals (`YYYY-MM-DD` date pickers + free-form prompt id) into the wire
 * shape consumed by the narrative observability and bias adapters. Date pickers emit
 * `YYYY-MM-DD` ; we expand to UTC day boundaries (`00:00:00Z` for `from`, `00:00:00Z` of the
 * **next** day for `to` so the interval stays half-open and the `to` filter behaves as « include
 * this day »). Empty `promptId` collapses to undefined.
 *
 * Returns undefined when every filter is empty — pages forward `undefined` to the adapter to mean
 * « no filter, fetch the default window ».
 */
export function buildFilterWindow(
  fromDate: string,
  toDate: string,
  promptId: string,
): FilterWindow | undefined {
  const from = fromDate ? `${fromDate}T00:00:00Z` : undefined;
  const to = toDate ? `${nextDayIso(toDate)}T00:00:00Z` : undefined;
  const id = promptId || undefined;
  if (!from && !to && !id) return undefined;
  return { from, to, promptId: id };
}

/**
 * `YYYY-MM-DD` → `YYYY-MM-DD` of the next calendar day, in UTC. No DST gymnastics needed — date
 * pickers carry pure dates, and the half-open interval contract is timezone-agnostic.
 */
function nextDayIso(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
