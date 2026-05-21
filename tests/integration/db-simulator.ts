import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export class DbSimulator {
    public db: Database.Database;

    constructor() {
        // Initialize an in-memory SQLite database
        this.db = new Database(':memory:');
        this.db.pragma('foreign_keys = ON');
        this.loadMigrations();
    }

    private loadMigrations() {
        const migrationsDir = path.join(__dirname, '../../migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        for (const file of files) {
            const sqlPath = path.join(migrationsDir, file);
            let sql = fs.readFileSync(sqlPath, 'utf-8');
            
            // Execute the migration. SQLite in-memory supports standard syntax.
            // Split by ';' and run statements, or use db.exec(sql)
            // Note: ALTER TABLE ... ADD COLUMN ... checks might need to ignore duplicate/failure if running multiple times, but since it's a new :memory: db every time, we can run it directly.
            try {
                this.db.exec(sql);
            } catch (err) {
                console.error(`Error running migration ${file}:`, err);
                throw err;
            }
        }
    }

    // Expose D1-compatible interface
    public prepare(query: string) {
        // Translate sqlite "?" parameters (which are 1-based, or named, or positional)
        // better-sqlite3 uses standard statements.
        // We will return a wrapper around better-sqlite3 Statement
        const stmt = this.db.prepare(query);
        return new PreparedStatementSimulator(stmt);
    }

    public async batch(statements: PreparedStatementSimulator[]) {
        // Execute in a transaction
        const runBatch = this.db.transaction(() => {
            for (const stmt of statements) {
                stmt.runSync();
            }
        });
        runBatch();
    }
}

class PreparedStatementSimulator {
    private stmt: Database.Statement;
    private boundArgs: any[] = [];

    constructor(stmt: Database.Statement) {
        this.stmt = stmt;
    }

    public bind(...args: any[]) {
        const clone = new PreparedStatementSimulator(this.stmt);
        // Map boolean values to 1/0 for SQLite compatibility, and format Date objects
        clone.boundArgs = args.map(arg => {
            if (typeof arg === 'boolean') {
                return arg ? 1 : 0;
            }
            if (arg instanceof Date) {
                return arg.toISOString();
            }
            return arg;
        });
        return clone;
    }

    public async all<T = any>() {
        const results = this.stmt.all(...this.boundArgs) as T[];
        return { results };
    }

    public async first<T = any>(colName?: string) {
        const row = this.stmt.get(...this.boundArgs) as any;
        if (!row) return null;
        if (colName) return row[colName] as T;
        return row as T;
    }

    public async run() {
        const info = this.stmt.run(...this.boundArgs);
        return {
            success: info.changes >= 0,
            meta: {
                changes: info.changes,
                duration: 0,
                last_row_id: info.lastInsertRowid
            }
        };
    }

    // Synchronous execution for transaction batch
    public runSync() {
        this.stmt.run(...this.boundArgs);
    }
}
