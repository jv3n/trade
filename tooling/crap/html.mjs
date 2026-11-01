/** The report as one self-contained page : no server, no dependency, open the file. */
export function renderHtml({ rows, moved, generatedAt, target }) {
  // `<` escaped : a `</script>` in a function's name would close the block.
  const data = JSON.stringify({ rows, moved, generatedAt, target }).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CRAP report</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: light-dark(#f7f7f8, #16171a);
    --card: light-dark(#fff, #1f2024);
    --text: light-dark(#1c1d21, #e8e8ea);
    --muted: light-dark(#6b6e76, #9a9da5);
    --line: light-dark(#e4e5e8, #30323a);
    --critical: light-dark(#c62828, #ef6b6b);
    --high: light-dark(#b26a00, #f0a93e);
    --moderate: light-dark(#4f46b8, #9d97ee);
    --low: var(--muted);
    --unknown: var(--muted);
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: var(--bg); color: var(--text);
    font: 14px/1.45 system-ui, sans-serif; }
  main { max-width: 1240px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0; }
  .sub { color: var(--muted); margin: 2px 0 20px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
  .tile b { display: block; font-size: 24px; font-variant-numeric: tabular-nums; }
  .tile span { color: var(--muted); }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
  button, select, input { font: inherit; color: inherit; background: var(--card);
    border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; }
  button { cursor: pointer; }
  button[aria-pressed='true'] { border-color: var(--text); font-weight: 600; }
  input { flex: 1; min-width: 180px; }
  .wrap { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 7px 12px; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th { position: sticky; top: 0; background: var(--card); color: var(--muted); font-weight: 600; cursor: pointer; user-select: none; }
  th[aria-sort]:not([aria-sort='none'])::after { content: ' ↓'; }
  th[aria-sort='ascending']::after { content: ' ↑'; }
  tr:last-child td { border-bottom: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .fn { font-family: ui-monospace, monospace; font-size: 13px; }
  .where { color: var(--muted); font-family: ui-monospace, monospace; font-size: 12px; }
  .band { font-weight: 600; }
  .count { color: var(--muted); margin-left: auto; }
  @media (max-width: 640px) { body { padding: 16px; } }
</style>
</head>
<body>
<main>
  <h1>CRAP report</h1>
  <p class="sub" id="sub"></p>
  <div class="tiles" id="tiles"></div>
  <div class="bar">
    <span id="views"></span>
    <select id="language" aria-label="Language">
      <option value="">All languages</option>
      <option value="ts">TypeScript</option>
      <option value="kt">Kotlin</option>
    </select>
    <input id="search" type="search" placeholder="Function or file" aria-label="Search" />
    <span class="count" id="count"></span>
  </div>
  <div class="wrap"><table><thead><tr id="head"></tr></thead><tbody id="body"></tbody></table></div>
</main>
<script>
const report = ${data};
const percent = (v) => (v === null ? '?' : Math.round(v * 100) + ' %');
const score = (v) => (v === null ? '?' : v.toFixed(1));
const views = {
  worst: { label: 'All', keep: () => true },
  wins: { label: 'Quick wins', keep: (r) => r.quickWin },
  refactor: { label: 'Refactor first', keep: (r) => r.complexity >= report.target && r.crap !== null },
  unknown: { label: 'No coverage data', keep: (r) => r.crap === null },
};
const columns = [
  { key: 'crap', label: 'CRAP', num: true, show: (r) => score(r.crap) },
  { key: 'complexity', label: 'CC', num: true, show: (r) => r.complexity },
  { key: 'coverage', label: 'Coverage', num: true, show: (r) => percent(r.coverage) },
  { key: 'needed', label: 'Needed', num: true, show: (r) => (r.needed === null ? 'refactor' : percent(r.needed)) },
  { key: 'band', label: 'Band', show: (r) => r.band, style: (r) => 'band' },
  { key: 'name', label: 'Function', show: (r) => r.name, style: () => 'fn' },
  { key: 'file', label: 'Where', show: (r) => r.file.replace(/^projects\\//, '') + ':' + r.line, style: () => 'where' },
];
const state = { view: 'worst', sort: 'crap', ascending: false };
const $ = (id) => document.getElementById(id);

$('sub').textContent = 'Generated ' + new Date(report.generatedAt).toLocaleString() + ' · target ' + report.target +
  (report.moved ? ' · since the last run : ' + report.moved.new + ' new, ' + report.moved.worse + ' worse, ' + report.moved.better + ' better' : '');

const tile = (value, label, band) => {
  const box = document.createElement('div');
  box.className = 'tile';
  const number = document.createElement('b');
  number.textContent = value;
  if (band) number.style.color = 'var(--' + band + ')';
  const text = document.createElement('span');
  text.textContent = label;
  box.append(number, text);
  return box;
};
$('tiles').append(
  tile(report.rows.length, 'functions'),
  ...['critical', 'high', 'moderate', 'low', 'unknown'].map((b) => tile(report.rows.filter((r) => r.band === b).length, b, b)),
);

for (const [key, view] of Object.entries(views)) {
  const button = document.createElement('button');
  button.textContent = view.label;
  button.dataset.view = key;
  button.onclick = () => { state.view = key; render(); };
  $('views').append(button, ' ');
}
for (const column of columns) {
  const th = document.createElement('th');
  th.textContent = column.label;
  if (column.num) th.className = 'num';
  th.onclick = () => {
    state.ascending = state.sort === column.key ? !state.ascending : !column.num;
    state.sort = column.key;
    render();
  };
  column.th = th;
  $('head').append(th);
}
$('language').onchange = render;
$('search').oninput = render;

function compare(a, b) {
  const [x, y] = [a[state.sort], b[state.sort]];
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return (x < y ? -1 : 1) * (state.ascending ? 1 : -1);
}

function render() {
  const language = $('language').value;
  const query = $('search').value.toLowerCase();
  const rows = report.rows
    .filter(views[state.view].keep)
    .filter((r) => !language || r.language === language)
    .filter((r) => !query || (r.name + ' ' + r.file).toLowerCase().includes(query))
    .sort(compare);
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === state.view));
  for (const column of columns) {
    column.th.setAttribute('aria-sort', state.sort === column.key ? (state.ascending ? 'ascending' : 'descending') : 'none');
  }
  $('count').textContent = rows.length + ' shown';
  $('body').replaceChildren(...rows.slice(0, 500).map((r) => {
    const tr = document.createElement('tr');
    for (const column of columns) {
      const td = document.createElement('td');
      td.textContent = column.show(r);
      td.className = [column.num ? 'num' : '', column.style?.(r) ?? ''].join(' ').trim();
      if (column.key === 'band') td.style.color = 'var(--' + r.band + ')';
      tr.append(td);
    }
    return tr;
  }));
}
render();
</script>
</body>
</html>
`;
}
