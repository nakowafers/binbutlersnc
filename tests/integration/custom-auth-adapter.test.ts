import { describe, expect, it, beforeEach } from 'vitest';
import { createAuthUsersAdapter } from '../../src/lib/auth/custom-adapter';
import { DbSimulator } from './db-simulator';

describe('Custom auth users adapter', () => {
    let simulator: DbSimulator;
    let adapter: ReturnType<typeof createAuthUsersAdapter>;

    beforeEach(() => {
        simulator = new DbSimulator();
        adapter = createAuthUsersAdapter(simulator as unknown as D1Database);
    });

    it('preserves auth user email when Auth.js sends a partial update', async () => {
        const user = await adapter.createUser?.({
            email: 'dispatch-admin@example.com',
            name: 'Dispatch Admin',
            emailVerified: null,
        });

        expect(user).toBeDefined();

        const emailVerified = new Date('2026-07-21T12:00:00.000Z');
        const updatedUser = await adapter.updateUser?.({
            id: user!.id,
            emailVerified,
        });

        expect(updatedUser?.email).toBe('dispatch-admin@example.com');
        expect(updatedUser?.emailVerified).toEqual(emailVerified);
    });
});
