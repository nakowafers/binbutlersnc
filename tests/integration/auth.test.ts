import { describe, it, expect, beforeEach } from 'vitest';
import { D1Adapter } from "@auth/d1-adapter";
import { DbSimulator } from './db-simulator';

describe('Auth D1 Adapter - Integration Tests', () => {
    let simulator: DbSimulator;
    let adapter: any;

    beforeEach(() => {
        simulator = new DbSimulator();
        // @ts-ignore - DbSimulator matches D1Database interface
        adapter = D1Adapter(simulator);
    });

    it('should create and retrieve a user', async () => {
        const user = {
            name: 'Auth Test',
            email: 'auth-test@example.com',
            emailVerified: new Date(),
            image: 'http://example.com/image.png',
        };

        const createdUser = await adapter.createUser(user);
        expect(createdUser.email).toBe(user.email);
        expect(createdUser.id).toBeDefined();

        const retrievedUser = await adapter.getUser(createdUser.id);
        expect(retrievedUser.name).toBe(user.name);
        expect(retrievedUser.role).toBe('CUSTOMER'); // Default role
    });

    it('should create and manage sessions', async () => {
        const user = await adapter.createUser({
            email: 'session-test@example.com',
        });

        const session = {
            sessionToken: 'session-token-123',
            userId: user.id,
            expires: new Date(Date.now() + 3600 * 1000),
        };

        await adapter.createSession(session);

        const retrievedSession = await adapter.getSessionAndUser(session.sessionToken);
        expect(retrievedSession).toBeDefined();
        expect(retrievedSession.session.userId).toBe(user.id);
        expect(retrievedSession.user.email).toBe('session-test@example.com');

        // Delete session
        await adapter.deleteSession(session.sessionToken);
        const deletedSession = await adapter.getSessionAndUser(session.sessionToken);
        expect(deletedSession).toBeNull();
    });

    it('should handle verification tokens', async () => {
        const identifier = 'verify@example.com';
        const token = 'verify-token-123';
        const expires = new Date(Date.now() + 3600 * 1000);

        await adapter.createVerificationToken({ identifier, token, expires });

        const retrievedToken = await adapter.useVerificationToken({ identifier, token });
        expect(retrievedToken).toBeDefined();
        expect(retrievedToken.token).toBe(token);

        // Should be deleted after use
        const secondUse = await adapter.useVerificationToken({ identifier, token });
        expect(secondUse).toBeNull();
    });
});
