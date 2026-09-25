import { parseISO } from 'date-fns';
import { Marked, Tokens } from 'marked';

/** The two folders the page shows : `docs/pattern/` and `docs/notes/`, one tab each. */
export type Shelf = 'pattern' | 'notes';

/** The files of each folder, in display order — patterns in the order of the Pattern menu. */
export const SHELVES: Record<Shelf, readonly string[]> = {
  pattern: ['GUS', 'DT', 'SIR', 'SIV', 'penny-break'],
  notes: ['execution-signals', 'four-sellers', 'stop-rule'],
};

export interface SheetRef {
  shelf: Shelf;
  file: string;
}

/** One file, read out of its Markdown. */
export interface Sheet extends SheetRef {
  /** « Gap Up Short » — the `#` title, without its « — pattern sheet » / « — fiche pattern » suffix. */
  title: string;
  /** The opening quote, rendered inline. */
  summaryHtml: string;
  /** The « Last revised » line ; null when the file has none (a sheet still to write). */
  revisedOn: Date | null;
  /** Everything else, rendered. */
  bodyHtml: string;
  /** The file could not be read : its panel says so, the others still show. */
  unreadable?: boolean;
}

/** What stands in for a file that could not be read — renamed, removed, a twin never written. */
export function unreadableSheet(ref: SheetRef): Sheet {
  return {
    ...ref,
    title: ref.file,
    summaryHtml: '',
    revisedOn: null,
    bodyHtml: '',
    unreadable: true,
  };
}

/** The DOM id of a file's panel — what a link between two files points at. */
export function sheetAnchor({ shelf, file }: SheetRef): string {
  return `sheet-${shelf}-${file}`;
}

/** The file an anchor names, if the page shows it. */
export function sheetOf(anchor: string): SheetRef | null {
  for (const shelf of Object.keys(SHELVES) as Shelf[]) {
    const file = SHELVES[shelf].find((f) => anchor === sheetAnchor({ shelf, file: f }));
    if (file) return { shelf, file };
  }
  return null;
}

const MD_LINK = /\[([^\]]*)\]\([^)]*\)/g;
/** « Last revised » in the English files, « Dernière révision » in their French twins. */
const REVISED = /^\*(?:Last revised|Dernière révision) : (\d{4}-\d{2}-\d{2})\b.*$/m;
/** `DT.md`, `DT.fr.md`, `../notes/four-sellers.md#section` — a link to another file of the docs. */
const DOC_LINK = /^(?:\.\.\/(pattern|notes)\/)?([\w-]+)(?:\.fr)?\.md(?:#.*)?$/;

/**
 * One renderer per folder, since a relative link resolves against the folder of the file it sits
 * in. A link to a file the page shows points at its panel ; a link to one it does not show keeps
 * its text only — its target does not exist in the app.
 */
function rendererFor(shelf: Shelf): Marked {
  return new Marked({
    renderer: {
      link(
        this: { parser: { parseInline(tokens: Tokens.Generic[]): string } },
        token: Tokens.Link,
      ) {
        const text = this.parser.parseInline(token.tokens);
        const doc = DOC_LINK.exec(token.href);
        if (!doc) return false;
        const target: SheetRef = { shelf: (doc[1] as Shelf | undefined) ?? shelf, file: doc[2] };
        return SHELVES[target.shelf].includes(target.file)
          ? `<a href="#${sheetAnchor(target)}">${text}</a>`
          : text;
      },
    },
  });
}

const RENDERERS: Record<Shelf, Marked> = {
  pattern: rendererFor('pattern'),
  notes: rendererFor('notes'),
};

/**
 * Splits a file into what the collapsed panel shows — title, summary, revision date — and the rest.
 * The header parts are taken out of the body so the open panel does not repeat them.
 */
export function parseSheet(ref: SheetRef, source: string): Sheet {
  const markdown = RENDERERS[ref.shelf];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  const skipBlank = () => {
    while (i < lines.length && lines[i].trim() === '') i++;
  };

  skipBlank();
  let title = ref.file;
  if (lines[i]?.startsWith('# ')) {
    title = lines[i]
      .slice(2)
      .replace(/\s+—\s+(?:pattern sheet|fiche pattern)\s*$/i, '')
      .trim();
    i++;
  }

  skipBlank();
  const quote: string[] = [];
  while (lines[i]?.startsWith('>')) {
    quote.push(lines[i].replace(/^>\s?/, ''));
    i++;
  }

  const rest = lines.slice(i).join('\n');
  const revised = REVISED.exec(rest);
  const body = rest
    .replace(REVISED, '')
    .replace(/^\s*(?:---\s*)?/, '')
    .trim();

  return {
    ...ref,
    title,
    // A click in a panel header opens the panel : the summary keeps the text of its links only.
    summaryHtml: markdown.parseInline(quote.join(' ').replace(MD_LINK, '$1').trim(), {
      async: false,
    }),
    revisedOn: revised ? parseISO(revised[1]) : null,
    bodyHtml: markdown.parse(body, { async: false }),
  };
}
