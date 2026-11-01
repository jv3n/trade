import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { TARGET, compare, coverageNeeded, quickWins, refactorFirst, scored } from './core.mjs';
import { kotlinEntries } from './kotlin.mjs';
import { typescriptEntries } from './typescript.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const frontend = join(repo, 'projects/frontend');
const backend = join(repo, 'projects/backend');
const snapshotPath = join(here, 'last.json');

const { values: args } = parseArgs({
  options: {
    lcov: { type: 'string', default: join(frontend, 'coverage/web/lcov.info') },
    kover: { type: 'string', default: join(backend, 'build/reports/kover/report.xml') },
    sarif: { type: 'string', default: join(backend, 'build/reports/detekt/main.sarif') },
    top: { type: 'string', default: '30' },
  },
});

const percent = (value) => (value === null ? '?' : `${Math.round(value * 100)} %`);
const score = (value) => (value === null ? '?' : value.toFixed(1));
const where = (row) => `\`${row.file.replace(/^projects\//, '')}:${row.line}\``;

function table(rows, columns) {
  const header = Object.keys(columns);
  console.log(`| ${header.join(' | ')} |\n|${header.map(() => ' --- |').join('')}`);
  for (const row of rows) console.log(`| ${Object.values(columns).map((cell) => cell(row)).join(' | ')} |`);
  console.log();
}

function summary(rows, title) {
  const count = (band) => rows.filter((row) => row.band === band).length;
  const bands = ['critical', 'high', 'moderate', 'low', 'unknown'];
  console.log(`**${title}** : ${rows.length} functions — ${bands.map((b) => `${count(b)} ${b}`).join(', ')}`);
}

const rows = [];
if (existsSync(args.lcov)) {
  rows.push(...typescriptEntries({ workspace: frontend, lcovPath: args.lcov, roots: ['apps/web/src'] }));
} else {
  console.error(`No TypeScript coverage at ${args.lcov} — run \`npm run test:coverage\``);
}
if (existsSync(args.sarif) && existsSync(args.kover)) {
  rows.push(...kotlinEntries({ sarifPath: args.sarif, koverPath: args.kover }));
} else {
  console.error('No Kotlin report — see tooling/crap/README.md');
}
if (rows.length === 0) process.exit(1);

const all = scored(rows);
const known = all.filter((row) => row.crap !== null);

console.log('# CRAP report\n');
summary(all.filter((row) => row.language === 'ts'), 'TypeScript');
summary(all.filter((row) => row.language === 'kt'), 'Kotlin');
if (existsSync(snapshotPath)) {
  const moved = compare(JSON.parse(readFileSync(snapshotPath, 'utf8')), all);
  console.log(`\nSince the last run : ${moved.new} new, ${moved.worse} worse, ${moved.better} better`);
}

console.log(`\n## Worst ${args.top}\n`);
table(known.slice(0, Number(args.top)), {
  CRAP: (row) => score(row.crap),
  CC: (row) => row.complexity,
  Coverage: (row) => percent(row.coverage),
  Band: (row) => row.band,
  Function: (row) => `\`${row.name}\``,
  Where: where,
});

const wins = quickWins(known);
console.log(`## Quick wins — under ${TARGET} with little more coverage\n`);
table(wins.slice(0, Number(args.top)), {
  CRAP: (row) => score(row.crap),
  CC: (row) => row.complexity,
  Coverage: (row) => percent(row.coverage),
  Needed: (row) => percent(coverageNeeded(row.complexity)),
  Function: (row) => `\`${row.name}\``,
  Where: where,
});

const refactor = refactorFirst(known);
console.log(`## Refactor first — CC ≥ ${TARGET}, no test can bring these under the target\n`);
table(refactor, {
  CC: (row) => row.complexity,
  CRAP: (row) => score(row.crap),
  Coverage: (row) => percent(row.coverage),
  Function: (row) => `\`${row.name}\``,
  Where: where,
});

const unknown = all.filter((row) => row.crap === null && row.complexity > 1);
console.log(`## No coverage data, complexity above 1 — ${unknown.length}\n`);
table(unknown.sort((a, b) => b.complexity - a.complexity).slice(0, 10), {
  CC: (row) => row.complexity,
  Function: (row) => `\`${row.name}\``,
  Where: where,
});

writeFileSync(snapshotPath, JSON.stringify(all, null, 2));
