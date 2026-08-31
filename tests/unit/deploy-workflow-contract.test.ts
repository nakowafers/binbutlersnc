import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync(path.resolve(import.meta.dirname, '../../.github/workflows/deploy.yml'), 'utf8');

describe('deploy workflow contract', () => {
    it('uses npm and the repository-pinned Wrangler with a Node 24-compatible action', () => {
        expect(workflow).toContain('uses: actions/setup-node@v4');
        expect(workflow).toContain("node-version: '24'");
        expect(workflow).toContain('cache: npm');
        expect(workflow).toContain('run: npm ci');
        expect(workflow).not.toContain('setup-bun');
        expect(workflow).not.toContain('bun install');
        expect(workflow.match(/cloudflare\/wrangler-action@v4/g)).toHaveLength(3);
        expect(workflow.match(/packageManager: npm/g)).toHaveLength(3);
        expect(workflow.match(/wranglerVersion: "4\.95\.0"/g)).toHaveLength(3);
        expect(workflow).toContain('npx --no-install wrangler versions upload');
        expect(workflow).toContain('set -euo pipefail');
    });

    it('retains production-only migration/deploy gates and preview-only upload', () => {
        expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
        expect(workflow).toContain("if: github.ref != 'refs/heads/main'");
    });
});
