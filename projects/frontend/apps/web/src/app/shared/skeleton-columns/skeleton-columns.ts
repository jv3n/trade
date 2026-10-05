import type { StbSkeletonColumn } from '@portfolioai/ui';

/** How a column of a listing shows in its skeleton : its header key, and its cell shape. */
export interface SkeletonColumnDef {
  key?: string;
  /** A unit shown after the header in brackets, as the real one does : « Montant ($ US) ». */
  unitKey?: string;
  /** A header that is a symbol rather than a word (« ✓ »), shown as is. */
  text?: string;
  variant?: StbSkeletonColumn['variant'];
  width?: StbSkeletonColumn['width'];
}

export type SkeletonColumnDefs = Readonly<Record<string, SkeletonColumnDef>>;

/** The header keys to translate — through `TranslateService.stream` : the files load late (#539). */
export function skeletonHeaderKeys(defs: SkeletonColumnDefs): string[] {
  const keys = Object.values(defs).flatMap((def) => [def.key, def.unitKey]);
  return [...new Set(keys.filter((key): key is string => !!key))];
}

/** The skeleton's columns, in the order the table shows them. */
export function toSkeletonColumns(
  ids: readonly string[],
  defs: SkeletonColumnDefs,
  labels: Readonly<Record<string, string>>,
): StbSkeletonColumn[] {
  return ids.map((id) => {
    const def = defs[id] ?? {};
    const header = def.key ? (labels[def.key] ?? '') : (def.text ?? '');
    // Not before the translations land : a bare « () » would flash on the first load.
    const unit = def.unitKey ? (labels[def.unitKey] ?? '') : '';
    const label = unit ? `${header} (${unit})` : header;
    return { label, variant: def.variant, width: def.width };
  });
}
