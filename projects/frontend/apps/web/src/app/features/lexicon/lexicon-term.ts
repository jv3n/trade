/** `Double Top (DT)` → heading `DT`, expansion `Double Top`. */
export interface SplitTerm {
  heading: string;
  expansion: string | null;
}

// Narrow on purpose : eleven entries parenthesise something else (`Risk per trade ($)`,
// `Average TP (Take Profit)`), and a looser rule would make nonsense headings of them.
const TRAILING_ACRONYM = /^(.+?)\s*\(([A-Z]{2,5})\)$/;

export function splitTerm(term: string): SplitTerm {
  const match = TRAILING_ACRONYM.exec(term.trim());
  return match
    ? { heading: match[2], expansion: match[1].trim() }
    : { heading: term.trim(), expansion: null };
}

/** Digits and symbols share `#` so the index never grows a button per punctuation mark. */
export function indexLetter(term: string): string {
  const first = term.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}
