// Every pattern sheet and note has a French twin, revised the same day (#419). Only the dates are
// compared, never the content : the check notices that one side moved and the other did not.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = fileURLToPath(new URL('../../../../../docs/', import.meta.url));
// The line `sheet.ts` already parses — the check and the renderer read the same format.
const REVISED = /^\*(?:Last revised|Dernière révision) : (\d{4}-\d{2}-\d{2})\b.*$/m;
const revisedOn = (path) => REVISED.exec(readFileSync(path, 'utf8'))?.[1] ?? null;

const problems = [];
for (const folder of ['pattern', 'notes']) {
  const dir = join(docs, folder);
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  for (const en of files.filter((f) => !f.endsWith('.fr.md'))) {
    const fr = en.replace(/\.md$/, '.fr.md');
    if (!files.includes(fr)) {
      problems.push(`${folder}/${en} has no French twin (${fr})`);
      continue;
    }
    const [a, b] = [revisedOn(join(dir, en)), revisedOn(join(dir, fr))];
    if (a !== b) problems.push(`${folder}/${en} revised ${a ?? '—'}, ${fr} revised ${b ?? '—'}`);
  }
}

if (problems.length) {
  console.error('Pattern sheets out of sync :\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('Every pattern sheet and note has a French twin revised the same day.');
