/**
 * Trading-lexicon **domain** types — consumed by the lexicon feature page and the
 * [LexiconRepository] port. A glossary entry is a [term] (English label) + its definition in **both**
 * languages ([definitionFr] / [definitionEn]) ; the UI shows the one matching the active language.
 * The dataset is **global / shared** (no per-user scoping) and small enough that the page loads it
 * whole and searches client-side.
 */

/** One glossary entry. */
export interface LexiconEntry {
  id: string;
  term: string;
  definitionFr: string;
  definitionEn: string;
}

/** Create / update payload — same fields minus the server-owned `id`. */
export interface LexiconEntryInput {
  term: string;
  definitionFr: string;
  definitionEn: string;
}
