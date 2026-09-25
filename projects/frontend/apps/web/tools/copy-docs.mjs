// Ships the pattern sheets and trading notes of the repo's `docs/` with the app (#419) : the build
// only takes assets from inside the workspace, so they are copied into `public/docs/` first. The
// copy is ignored by git — `docs/pattern/` and `docs/notes/` stay the only source.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDocs = fileURLToPath(new URL('../../../../../docs/', import.meta.url));
const target = fileURLToPath(new URL('../public/docs/', import.meta.url));

rmSync(target, { recursive: true, force: true });
for (const folder of ['pattern', 'notes']) {
  mkdirSync(join(target, folder), { recursive: true });
  for (const file of readdirSync(join(repoDocs, folder)).filter((f) => f.endsWith('.md'))) {
    copyFileSync(join(repoDocs, folder, file), join(target, folder, file));
  }
}
