import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';

const entry = process.argv[2];
if (!entry) {
  console.error('Usage: node scripts/run-local-audit.mjs scripts/AUDIT.ts [options]');
  process.exit(1);
}

const directory = mkdtempSync(join(tmpdir(), 'binbutlers-local-audit-'));
const output = join(directory, 'audit.cjs');
try {
  await build({ entryPoints: [resolve(entry)], outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node20', tsconfig: resolve('tsconfig.json'), external: ['better-sqlite3', 'stripe'] });
  const result = spawnSync(process.execPath, [output, ...process.argv.slice(3)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_PATH: join(process.cwd(), 'node_modules') },
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
