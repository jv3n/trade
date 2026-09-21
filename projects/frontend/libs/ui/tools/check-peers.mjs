// Fails when the lib's Angular peer ranges lag behind the workspace's Angular major. Nothing else
// catches it : inside the workspace the app resolves the real versions, and Dependabot neither
// bumps peerDependencies nor takes Angular majors (#251).
import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const majorOf = (range) => Number(/\d+/.exec(range)?.[0]);

const workspace = readJson('../../../package.json');
const lib = readJson('../package.json');

const expected = majorOf(workspace.dependencies['@angular/core']);
const drifted = Object.entries(lib.peerDependencies)
  .filter(([name]) => name.startsWith('@angular/'))
  .filter(([, range]) => majorOf(range) !== expected);

if (drifted.length > 0) {
  for (const [name, range] of drifted) {
    console.error(`libs/ui peer ${name}@${range} — the workspace is on Angular ${expected}`);
  }
  console.error(`Lift them to ^${expected}.0.0 in libs/ui/package.json.`);
  process.exit(1);
}
console.log(`libs/ui Angular peers match the workspace (Angular ${expected}).`);
