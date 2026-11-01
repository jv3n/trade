import assert from 'node:assert/strict';
import { test } from 'node:test';
import { band, compare, coverageNeeded, crap, quickWins, rangeCoverage, refactorFirst, scored } from './core.mjs';
import { parseKover } from './kotlin.mjs';
import { parseLcov } from './typescript.mjs';

/**
 * The scoring behind the CRAP report : what a wrong number here costs is a function reported safe,
 * or a developer told to test what only a refactor can fix. Guards the two formulas, the rule that
 * coverage is never estimated, and both coverage formats.
 */

const row = (complexity, coverage) => ({ file: 'a.ts', name: `fn${complexity}`, complexity, coverage });

test('a fully covered function scores its complexity', () => {
  assert.equal(crap(12, 1), 12);
});

test('an untested function scores CC² + CC', () => {
  assert.equal(crap(7, 0), 56);
});

test('a function without coverage data has no score, rather than a guessed one', () => {
  assert.equal(crap(7, null), null);
  assert.equal(band(null), 'unknown');
});

test('the bands split at 5, 15 and 30', () => {
  assert.deepEqual([4.9, 5, 14.9, 15, 30, 30.1].map(band), [
    'low',
    'moderate',
    'moderate',
    'high',
    'high',
    'critical',
  ]);
});

test('the coverage needed brings a function exactly to the target', () => {
  const needed = coverageNeeded(8);

  assert.ok(Math.abs(crap(8, needed) - 15) < 1e-9);
});

test('no coverage is needed by a function under the target even untested', () => {
  assert.equal(coverageNeeded(3), 0);
});

test('from a complexity of 15, no coverage is enough', () => {
  assert.equal(coverageNeeded(15), null);
});

test('coverage reads the lines of the range only', () => {
  const hits = new Map([
    [1, 5],
    [10, 1],
    [11, 0],
    [20, 3],
  ]);

  assert.equal(rangeCoverage(hits, 10, 11), 0.5);
});

test('a range with no instrumented line has unknown coverage, not zero', () => {
  assert.equal(rangeCoverage(new Map([[1, 1]]), 10, 11), null);
  assert.equal(rangeCoverage(undefined, 10, 11), null);
});

test('rows come worst first, the unknown ones last', () => {
  const rows = scored([row(2, 1), row(9, null), row(7, 0)]);

  assert.deepEqual(
    rows.map((it) => it.complexity),
    [7, 2, 9],
  );
});

test('a quick win is close to its needed coverage ; a function needing a refactor is not one', () => {
  const rows = scored([row(8, 0.4), row(8, 0), row(20, 0.9), row(3, 0)]);

  assert.deepEqual(
    quickWins(rows).map((it) => it.coverage),
    [0.4],
  );
  assert.deepEqual(
    refactorFirst(rows).map((it) => it.complexity),
    [20],
  );
});

test('the comparison counts new, worse and better functions by file and name', () => {
  const before = scored([row(8, 0.5), row(9, 0.5)]);
  const after = scored([row(8, 0.2), row(9, 0.9), row(4, 1)]);

  assert.deepEqual(compare(before, after), { new: 1, worse: 1, better: 1 });
});

test('lcov keeps the best hit of a line read twice, per source file', () => {
  const files = parseLcov('SF:apps/a.ts\nDA:3,0\nDA:3,2\nDA:4,0\nend_of_record\nSF:apps/b.ts\nDA:1,1\n');

  assert.equal(files.get('apps/a.ts').get(3), 2);
  assert.equal(files.get('apps/a.ts').get(4), 0);
  assert.equal(files.get('apps/b.ts').get(1), 1);
});

test('kover line hits are keyed by package and file, so two files of one name stay apart', () => {
  const xml = `
    <package name="com/x/a"><sourcefile name="Service.kt"><line nr="5" mi="0" ci="6" mb="0" cb="0"/></sourcefile></package>
    <package name="com/x/b"><sourcefile name="Service.kt"><line nr="5" mi="3" ci="0" mb="0" cb="0"/></sourcefile></package>`;

  const files = parseKover(xml);

  assert.equal(files.get('com/x/a/Service.kt').get(5), 6);
  assert.equal(files.get('com/x/b/Service.kt').get(5), 0);
});
