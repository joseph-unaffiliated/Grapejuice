/**
 * The desktop gate: serve the exported build, capture the current set, compare with
 * the baseline. Screens that differ are recaptured up to two more times, because
 * headless Chrome occasionally places text a fraction of a pixel differently; a real
 * change stays different on every try and fails the gate.
 *
 *   node scripts/desktop-shots/gate.mjs [--allow id,id]
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const allowIdx = process.argv.indexOf('--allow');
const allow = allowIdx >= 0 ? process.argv[allowIdx + 1] : '';
const BASE = 'tmp/desktop-shots/baseline';
const CUR = 'tmp/desktop-shots/current';
const JSON_OUT = 'tmp/desktop-shots/changed.json';

const server = spawn('node', ['scripts/desktop-shots/serve.mjs', '5055', 'dist'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));

function run(cmd, args, env = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  return res.status ?? 1;
}

let status = 1;
try {
  fs.rmSync(CUR, { recursive: true, force: true });
  run('node', ['scripts/desktop-shots/shots.mjs', CUR]);
  const compareArgs = ['scripts/desktop-shots/compare.mjs', BASE, CUR, ...(allow ? ['--allow', allow] : [])];
  status = run('node', compareArgs, { GJ_COMPARE_JSON: JSON_OUT });
  for (let attempt = 1; status !== 0 && attempt <= 2; attempt++) {
    const changed = JSON.parse(fs.readFileSync(JSON_OUT, 'utf8'));
    if (!changed.length) break;
    console.log(`\nRetry ${attempt}: recapturing ${changed.join(', ')}`);
    run('node', ['scripts/desktop-shots/shots.mjs', CUR, '--only', changed.join(',')]);
    status = run('node', compareArgs, { GJ_COMPARE_JSON: JSON_OUT });
  }
} finally {
  server.kill();
}
process.exit(status);
