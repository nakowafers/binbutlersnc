declare module 'better-sqlite3' {
    interface Statement {
        all(...params: unknown[]): unknown[];
        get(...params: unknown[]): unknown;
        run(...params: unknown[]): { changes: number };
    }

    interface DatabaseOptions {
        readonly?: boolean;
        fileMustExist?: boolean;
    }

    class Database {
        constructor(filename: string, options?: DatabaseOptions);
        prepare(sql: string): Statement;
    }

    export default Database;
}
