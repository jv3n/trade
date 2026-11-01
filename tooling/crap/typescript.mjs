import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { rangeCoverage } from './core.mjs';

const SKIPPED = /(\.spec|\.stories|\.d)\.ts$/;

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !SKIPPED.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** `SF:` paths are relative to the frontend workspace, and may be absolute on another machine. */
export function parseLcov(text) {
  const files = new Map();
  let hits = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      hits = new Map();
      files.set(line.slice(3).trim(), hits);
    } else if (line.startsWith('DA:') && hits) {
      const [nr, count] = line.slice(3).split(',').map(Number);
      hits.set(nr, Math.max(hits.get(nr) ?? 0, count));
    }
  }
  return files;
}

function complexityOf(ts, root) {
  const { SyntaxKind: Kind } = ts;
  let complexity = 1;
  const visit = (node) => {
    switch (node.kind) {
      case Kind.IfStatement:
      case Kind.ConditionalExpression:
      case Kind.CaseClause:
      case Kind.CatchClause:
      case Kind.ForStatement:
      case Kind.ForInStatement:
      case Kind.ForOfStatement:
      case Kind.WhileStatement:
      case Kind.DoStatement:
        complexity += 1;
        break;
      case Kind.BinaryExpression: {
        const operator = node.operatorToken.kind;
        if (
          operator === Kind.AmpersandAmpersandToken ||
          operator === Kind.BarBarToken ||
          operator === Kind.QuestionQuestionToken
        )
          complexity += 1;
        break;
      }
      default:
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return complexity;
}

function holdsFunction(ts, node) {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return true;
  return ts.forEachChild(node, (child) => holdsFunction(ts, child)) ?? false;
}

/**
 * The entries of a file : top-level functions and arrow constants, class methods, and class fields
 * holding a function — `computed()`, `rxResource()`, where much of the logic lives. A nested
 * function counts in its parent. Templates are not read.
 */
function entriesOf(ts, source) {
  const entries = [];
  const add = (name, node) => entries.push({ name, node });
  const member = (owner, node) => {
    const name = `${owner}.${node.name?.getText(source) ?? 'constructor'}`;
    if (ts.isMethodDeclaration(node) || ts.isAccessor(node) || ts.isConstructorDeclaration(node)) {
      if (node.body) add(name, node);
    } else if (ts.isPropertyDeclaration(node) && node.initializer) {
      if (holdsFunction(ts, node.initializer)) add(name, node.initializer);
    }
  };
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.body) {
      add(statement.name?.text ?? 'default', statement);
    } else if (ts.isClassDeclaration(statement)) {
      statement.members.forEach((node) => member(statement.name?.text ?? 'default', node));
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer && holdsFunction(ts, declaration.initializer)) {
          add(declaration.name.getText(source), declaration.initializer);
        }
      }
    }
  }
  return entries;
}

export function typescriptEntries({ workspace, lcovPath, roots }) {
  const require = createRequire(join(workspace, 'package.json'));
  const ts = require('typescript');
  const coverage = parseLcov(readFileSync(lcovPath, 'utf8'));
  const rows = [];
  for (const root of roots) {
    for (const path of sources(join(workspace, root))) {
      const text = readFileSync(path, 'utf8');
      const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      const file = relative(workspace, path);
      const hits = coverage.get(file);
      for (const { name, node } of entriesOf(ts, source)) {
        const line = (position) => source.getLineAndCharacterOfPosition(position).line + 1;
        const start = line(node.getStart(source));
        rows.push({
          language: 'ts',
          file: `projects/frontend/${file}`,
          name,
          line: start,
          complexity: complexityOf(ts, node),
          coverage: rangeCoverage(hits, start, line(node.getEnd())),
        });
      }
    }
  }
  return rows;
}
