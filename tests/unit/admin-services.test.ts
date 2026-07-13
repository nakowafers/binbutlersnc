import { describe, expect, it, vi } from 'vitest';
import { AdminSettingsError, AdminSettingsService } from '../../src/lib/admin/AdminSettingsService';

describe('AdminSettingsService', () => {
    it('rejects unsupported setting keys', async () => {
        const repo = { setGlobalSetting: vi.fn() };
        const service = new AdminSettingsService(repo as any);

        await expect(service.updateSetting('unsupported', '1'))
            .rejects.toEqual(new AdminSettingsError(400, 'Invalid setting key'));
        expect(repo.setGlobalSetting).not.toHaveBeenCalled();
    });

    it('persists allowed setting keys', async () => {
        const repo = { setGlobalSetting: vi.fn().mockResolvedValue(undefined) };
        const service = new AdminSettingsService(repo as any);

        await service.updateSetting('holiday_offset_hours', '24');

        expect(repo.setGlobalSetting).toHaveBeenCalledWith('holiday_offset_hours', '24');
    });
});
