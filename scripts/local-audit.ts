import fs from 'fs';
import path from 'path';

const FORBIDDEN_ARGUMENTS = new Set(['--remote', '--production', '--staging', '--env']);

/** Shared safety boundary for audits that may only target a local SQLite file. */
export function assertLocalOnlyAuditArguments(args: readonly string[], allowedOptions: readonly string[]): void {
    const allowed = new Set(allowedOptions);
    for (const argument of args) {
        const option = argument.split('=', 1)[0];
        if (option === '--apply' || option.startsWith('--apply')) {
            throw new Error('This audit is permanently read-only: --apply is not supported.');
        }
        if (FORBIDDEN_ARGUMENTS.has(option) || option.startsWith('--remote') || option.startsWith('--production')) {
            throw new Error('This audit only opens a local SQLite file or fixture and never accepts a remote D1 target.');
        }
        if (argument.startsWith('--') && argument.includes('=')) throw new Error('Inline audit option values are not supported.');
        if (option.startsWith('--') && !allowed.has(option)) throw new Error(`Unsupported audit option: ${option}`);
    }
}

/** Shared safety boundary for operational audits that never support mutation. */
export function assertLocalReadOnlyAuditArguments(args: readonly string[], allowedOptions: readonly string[]): void {
    if (args.some((argument) => argument.split('=', 1)[0].startsWith('--persist'))) {
        throw new Error('This audit is permanently read-only: persistence is not supported.');
    }
    assertLocalOnlyAuditArguments(args, allowedOptions);
}

export function optionValue(args: readonly string[], option: string): string | null {
    const index = args.indexOf(option);
    if (index === -1) return null;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
    return value;
}

/** Finds a file-backed local Miniflare database; it never invokes Wrangler or a remote binding. */
export function findLocalSqlitePath(explicitPath: string | null): string {
    if (explicitPath) {
        const resolved = path.resolve(explicitPath);
        if (!fs.statSync(resolved).isFile()) throw new Error('--db must name an existing local SQLite file.');
        return resolved;
    }
    const directory = path.join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
    const candidates = fs.existsSync(directory)
        ? fs.readdirSync(directory)
            .filter((file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite')
            .map((file) => ({ path: path.join(directory, file), mtime: fs.statSync(path.join(directory, file)).mtimeMs }))
            .sort((left, right) => right.mtime - left.mtime)
        : [];
    if (!candidates[0]) throw new Error('No local D1 SQLite database found. Run local migrations first or pass --db PATH_TO_LOCAL_SQLITE.');
    return candidates[0].path;
}

export function readJsonFixture<T>(fixturePath: string | null, label: string): T | null {
    if (!fixturePath) return null;
    try {
        return JSON.parse(fs.readFileSync(path.resolve(fixturePath), 'utf8')) as T;
    } catch {
        throw new Error(`${label} must be readable JSON.`);
    }
}
