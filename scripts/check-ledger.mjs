import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const req = JSON.parse(readFileSync(new URL('../requirements.json', import.meta.url), 'utf8'));
const extraDir = new URL('../requirements.d/', import.meta.url);
if (existsSync(extraDir)) {
  for (const f of readdirSync(extraDir).filter((n) => n.endsWith('.json')).sort()) {
    req.requirements.push(...JSON.parse(readFileSync(new URL(f, extraDir), 'utf8')));
  }
}
const dupes = req.requirements.map((r) => r.id).filter((id, i, a) => a.indexOf(id) !== i);
if (dupes.length) {
  console.error(`duplicate requirement ids: ${dupes.join(', ')}`);
  process.exit(1);
}
const results = [];

function addVitest(file) {
  if (!existsSync(file)) return console.warn(`missing ${file}`);
  for (const f of JSON.parse(readFileSync(file, 'utf8')).testResults ?? []) {
    for (const a of f.assertionResults ?? []) results.push({ title: a.fullName ?? a.title, status: a.status === 'passed' ? 'passed' : a.status });
  }
}

function addPlaywright(file) {
  if (!existsSync(file)) return console.warn(`missing ${file}`);
  const walk = (suite, prefix) => {
    for (const s of suite.suites ?? []) walk(s, `${prefix} ${s.title}`);
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = t.results?.[t.results.length - 1];
        const status = t.status === 'skipped' ? 'skipped' : last?.status === 'passed' || t.status === 'expected' || t.status === 'flaky' ? 'passed' : 'failed';
        results.push({ title: `${prefix} ${spec.title} (${t.projectName})`, status });
      }
    }
  };
  walk(JSON.parse(readFileSync(file, 'utf8')), '');
}

addVitest('reports/vitest.json');
for (const f of existsSync('reports') ? readdirSync('reports').filter((n) => /^playwright.*\.json$/.test(n)) : []) addPlaywright(`reports/${f}`);

const rows = req.requirements.map((r) => {
  const tagged = results.filter((t) => t.title.includes(`[${r.id}]`));
  const passed = tagged.filter((t) => t.status === 'passed').length;
  const failed = tagged.filter((t) => t.status === 'failed').length;
  const ok = passed > 0 && failed === 0;
  return { ...r, passed, failed, ok };
});

const okCount = rows.filter((r) => r.ok).length;
const lines = [
  `# Requirement ledger`,
  ``,
  `${okCount} / ${rows.length} hard requirements passing (${((100 * okCount) / rows.length).toFixed(1)}%).`,
  ``,
  `| Requirement | Owner | Tests passed | Tests failed | Status |`,
  `|---|---|---|---|---|`,
  ...rows.map((r) => `| **${r.id}** ${r.text} | ${r.owner} | ${r.passed} | ${r.failed} | ${r.ok ? 'PASS' : 'FAIL'} |`),
];
mkdirSync('reports', { recursive: true });
writeFileSync('reports/ledger.md', lines.join('\n') + '\n');
writeFileSync('reports/ledger.json', JSON.stringify({ ok: okCount, total: rows.length, rows }, null, 2));
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(16)} passed=${r.passed} failed=${r.failed}`);
console.log(`\n${okCount}/${rows.length} requirements passing`);
process.exit(okCount === rows.length ? 0 : 1);
