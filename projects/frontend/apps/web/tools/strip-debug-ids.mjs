// Drops the debug ids the Angular build embeds in the browser bundles (#568) : it writes only the
// `//# debugId=` comment, not the runtime snippet the error SDK reads, and `sourcemaps inject` skips
// any file that already has an id — so the events carried none. Run before `inject`, which then
// writes all three : the snippet, the comment and the map's `debugId`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];

for (const file of readdirSync(dir)) {
  const path = join(dir, file);
  if (file.endsWith('.js')) {
    writeFileSync(path, readFileSync(path, 'utf8').replace(/\n\/\/# debugId=[^\r\n]*/, ''));
  } else if (file.endsWith('.js.map')) {
    const map = JSON.parse(readFileSync(path, 'utf8'));
    delete map.debugId;
    writeFileSync(path, JSON.stringify(map));
  }
}
