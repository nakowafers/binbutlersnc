import { ISettingsRepository } from '../types';

export class D1SettingsRepositoryAdapter implements ISettingsRepository {
    constructor(private readonly db: D1Database) {}

    async getGlobalSetting(key: string): Promise<string | null> {
        const result = await this.db.prepare("SELECT value FROM global_settings WHERE key = ?")
            .bind(key)
            .first<{ value: string }>();
        return result?.value || null;
    }

    async setGlobalSetting(key: string, value: string): Promise<void> {
        await this.db.prepare(
            'INSERT INTO global_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP'
        )
        .bind(key, value)
        .run();
    }

    async acquireLock(key: string, value: string, expireThreshold: number): Promise<boolean> {
        await this.db.prepare(
            `INSERT INTO global_settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET
               value = EXCLUDED.value,
               updated_at = CURRENT_TIMESTAMP
             WHERE json_extract(value, '$.acquired_at') < ?`
        ).bind(key, value, expireThreshold).run();

        const lockRow = await this.db.prepare(
            'SELECT value FROM global_settings WHERE key = ?'
        ).bind(key).first<{ value: string }>();

        if (!lockRow) return false;

        try {
            const parsed = JSON.parse(lockRow.value) as { acquired_at?: number };
            const selfParsed = JSON.parse(value) as { acquired_at?: number };
            return parsed.acquired_at === selfParsed.acquired_at;
        } catch {
            return false;
        }
    }
}
