import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

describe('package manager contract', () => {
    it('keeps npm as the only lockfile-selected package manager for hosted builds', () => {
        expect(fs.existsSync(path.join(repositoryRoot, 'package-lock.json'))).toBe(true);
        expect(fs.existsSync(path.join(repositoryRoot, 'pnpm-lock.yaml'))).toBe(false);
        expect(fs.existsSync(path.join(repositoryRoot, 'pnpm-workspace.yaml'))).toBe(false);
    });
});
