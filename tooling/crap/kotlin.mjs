import { readFileSync } from 'node:fs';
import { rangeCoverage } from './core.mjs';

const COMPLEXITY = /^(.*?)\s*appears to be too complex.*\(complexity: (\d+)\)/;
const PACKAGE = /<package name="([^"]*)"/g;
const SOURCE_FILE = /<sourcefile name="([^"]*)">([\s\S]*?)<\/sourcefile>/g;
const LINE = /<line nr="(\d+)" mi="(\d+)" ci="(\d+)"/g;
const MAIN_SOURCES = /^.*?src\/main\/kotlin\//;
const LAST_LINE = Number.MAX_SAFE_INTEGER;
/** Local seed and test-only endpoints : never in production, untested by design. */
const OUT_OF_SCOPE = /\/portfolioai\/(devdata|e2e)\//;

/** Kover's line hits, keyed `com/portfolioai/x/File.kt`. A method carries no line, a file does. */
export function parseKover(text) {
  const files = new Map();
  const packages = [...text.matchAll(PACKAGE)];
  packages.forEach((match, index) => {
    const end = packages[index + 1]?.index ?? text.length;
    for (const [, name, lines] of text.slice(match.index, end).matchAll(SOURCE_FILE)) {
      const hits = new Map();
      for (const [, nr, , covered] of lines.matchAll(LINE)) hits.set(Number(nr), Number(covered));
      files.set(`${match[1]}/${name}`, hits);
    }
  });
  return files;
}

function findings(sarif) {
  return sarif.runs
    .flatMap((run) => run.results)
    .filter((result) => result.ruleId.endsWith('CyclomaticComplexMethod'))
    .map((result) => {
      const [, label, complexity] = result.message.text.match(COMPLEXITY) ?? [];
      const location = result.locations[0].physicalLocation;
      return {
        file: location.artifactLocation.uri.replace(/^file:\/+/, ''),
        name: label?.split(/\s+/).pop(),
        line: location.region.startLine,
        complexity: Number(complexity),
      };
    })
    .filter((finding) => finding.complexity > 0 && !OUT_OF_SCOPE.test(finding.file));
}

/**
 * A function's range runs up to the next one in the file : detekt gives where it starts only. Lines
 * between two functions land in the former, and matching on lines keeps lambdas and overloads, which
 * Kover splits or merges by name, on the right function.
 */
export function kotlinEntries({ sarifPath, koverPath }) {
  const coverage = parseKover(readFileSync(koverPath, 'utf8'));
  const byFile = Map.groupBy(findings(JSON.parse(readFileSync(sarifPath, 'utf8'))), (it) => it.file);
  const rows = [];
  for (const [file, functions] of byFile) {
    const hits = coverage.get(file.replace(MAIN_SOURCES, ''));
    functions.sort((a, b) => a.line - b.line);
    functions.forEach((finding, index) => {
      const end = (functions[index + 1]?.line ?? LAST_LINE + 1) - 1;
      rows.push({ language: 'kt', ...finding, coverage: rangeCoverage(hits, finding.line, end) });
    });
  }
  return rows;
}
