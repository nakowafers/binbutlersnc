import { ISettingsRepository } from '@/lib/db/types';

const ALLOWED_KEYS = ['holiday_offset_hours'];

export class AdminSettingsService {
    constructor(private readonly settingsRepo: ISettingsRepository) {}

    async updateSetting(key: string, value: string): Promise<void> {
        if (!key || value === undefined) {
            throw new AdminSettingsError(400, 'Missing key or value');
        }

        if (!ALLOWED_KEYS.includes(key)) {
            throw new AdminSettingsError(400, 'Invalid setting key');
        }

        await this.settingsRepo.setGlobalSetting(key, value);
    }
}

export class AdminSettingsError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}
