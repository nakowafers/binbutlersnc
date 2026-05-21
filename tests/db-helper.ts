import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function createTestD1() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    
    // Load migrations
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir).sort();
    
    for (const file of files) {
        if (file.endsWith('.sql')) {
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            db.exec(sql);
        }
    }

    // Wrap better-sqlite3 with D1 API interface
    const d1Mock = {
        prepare: (sql: string) => {
            let boundParams: any[] = [];
            
            const formatArg = (arg: any) => {
                if (typeof arg === 'boolean') {
                    return arg ? 1 : 0;
                }
                return arg;
            };

            const self = {
                bind: function(...args: any[]) {
                    boundParams = args.map(formatArg);
                    return self;
                },
                first: async function<T>(colName?: string): Promise<T | null> {
                    const stmt = db.prepare(sql);
                    const row = stmt.get(...boundParams) as any;
                    if (!row) return null;
                    if (colName) return row[colName] as T;
                    
                    // Map 0/1 back to boolean for is_paused and converted fields if they exist
                    const mappedRow = { ...row };
                    if ('is_paused' in mappedRow) {
                        mappedRow.is_paused = !!mappedRow.is_paused;
                    }
                    if ('converted' in mappedRow) {
                        mappedRow.converted = !!mappedRow.converted;
                    }
                    return mappedRow as T;
                },
                all: async function<T>(): Promise<{ results: T[] }> {
                    const stmt = db.prepare(sql);
                    const rows = stmt.all(...boundParams) as any[];
                    const mappedRows = rows.map(row => {
                        const mappedRow = { ...row };
                        if ('is_paused' in mappedRow) {
                            mappedRow.is_paused = !!mappedRow.is_paused;
                        }
                        if ('converted' in mappedRow) {
                            mappedRow.converted = !!mappedRow.converted;
                        }
                        return mappedRow;
                    });
                    return { results: mappedRows as T[] };
                },
                run: async function() {
                    const stmt = db.prepare(sql);
                    stmt.run(...boundParams);
                    return { success: true };
                }
            };

            return self;
        },
        batch: async function(statements: any[]) {
            const results = [];
            for (const stmt of statements) {
                results.push(await stmt.run());
            }
            return results;
        }
    };

    return { db, d1Mock };
}
