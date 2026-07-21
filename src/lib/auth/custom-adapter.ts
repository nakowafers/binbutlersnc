import type { Adapter, AdapterUser, AdapterSession } from "@auth/core/adapters";

function toUser(row: Record<string, unknown> | null): AdapterUser | null {
    if (!row) return null;
    return {
        id: row.id as string,
        email: row.email as string,
        name: (row.name as string) ?? null,
        emailVerified: row.emailVerified ? new Date(row.emailVerified as string) : null,
        image: (row.image as string) ?? null,
    };
}

function toSession(row: Record<string, unknown> | null): AdapterSession | null {
    if (!row) return null;
    return {
        sessionToken: row.sessionToken as string,
        userId: row.userId as string,
        expires: new Date(row.expires as string),
    };
}

export function createAuthUsersAdapter(db: D1Database): Adapter {
    return {
        async createUser(user) {
            const id = (user as unknown as Record<string, string>).id || crypto.randomUUID();
            await db.prepare(
                'INSERT OR IGNORE INTO auth_users (id, email, name, emailVerified, image) VALUES (?, ?, ?, ?, ?)'
            ).bind(
                id,
                user.email,
                user.name ?? null,
                user.emailVerified?.toISOString() ?? null,
                user.image ?? null,
            ).run();
            const row = await db.prepare(
                'SELECT id, name, email, emailVerified, image FROM auth_users WHERE id = ?'
            ).bind(id).first<Record<string, unknown>>();
            const existing = toUser(row);
            if (existing) return existing;
            throw new Error('createUser: failed to create user and no existing user found');
        },

        async getUser(id) {
            let row = await db.prepare(
                'SELECT id, name, email, emailVerified, image FROM auth_users WHERE id = ?'
            ).bind(id).first<Record<string, unknown>>();
            if (row) return toUser(row);
            row = await db.prepare(
                'SELECT id, name, email, emailVerified, image FROM customers WHERE id = ?'
            ).bind(id).first<Record<string, unknown>>();
            return toUser(row);
        },

        async getUserByEmail(email) {
            let row = await db.prepare(
                'SELECT id, name, email, emailVerified, image FROM auth_users WHERE LOWER(email) = LOWER(?)'
            ).bind(email).first<Record<string, unknown>>();
            if (row) return toUser(row);
            row = await db.prepare(
                'SELECT id, name, email, emailVerified, image FROM customers WHERE LOWER(email) = LOWER(?)'
            ).bind(email).first<Record<string, unknown>>();
            return toUser(row);
        },

        async getUserByAccount({ providerAccountId, provider }) {
            const account = await db.prepare(
                'SELECT userId FROM accounts WHERE providerAccountId = ? AND provider = ?'
            ).bind(providerAccountId, provider).first<{ userId: string }>();
            if (!account) return null;
            let row = await db.prepare(
                'SELECT id, name, email, emailVerified, image FROM auth_users WHERE id = ?'
            ).bind(account.userId).first<Record<string, unknown>>();
            if (row) return toUser(row);
            row = await db.prepare(
                'SELECT id, name, email, emailVerified, image FROM customers WHERE id = ?'
            ).bind(account.userId).first<Record<string, unknown>>();
            return toUser(row);
        },

        async updateUser(user) {
            const existingAuthUser = await db.prepare(
                'SELECT id, name, email, emailVerified, image FROM auth_users WHERE id = ?'
            ).bind(user.id).first<Record<string, unknown>>();
            if (existingAuthUser) {
                const emailVerified = Object.hasOwn(user, 'emailVerified')
                    ? user.emailVerified?.toISOString() ?? null
                    : existingAuthUser.emailVerified ?? null;

                await db.prepare(
                    'UPDATE auth_users SET name = ?, email = ?, emailVerified = ?, image = ? WHERE id = ?'
                ).bind(
                    Object.hasOwn(user, 'name') ? user.name ?? null : existingAuthUser.name ?? null,
                    Object.hasOwn(user, 'email') ? user.email : existingAuthUser.email,
                    emailVerified,
                    Object.hasOwn(user, 'image') ? user.image ?? null : existingAuthUser.image ?? null,
                    user.id,
                ).run();

                const row = await db.prepare(
                    'SELECT id, name, email, emailVerified, image FROM auth_users WHERE id = ?'
                ).bind(user.id).first<Record<string, unknown>>();
                return toUser(row)!;
            }

            const existingCustomer = await db.prepare(
                'SELECT id, name, email, emailVerified, image FROM customers WHERE id = ?'
            ).bind(user.id).first<Record<string, unknown>>();
            if (!existingCustomer) {
                throw new Error(`updateUser: user not found for id ${user.id}`);
            }

            const emailVerified = Object.hasOwn(user, 'emailVerified')
                ? user.emailVerified?.toISOString() ?? null
                : existingCustomer.emailVerified ?? null;

            await db.prepare(
                'UPDATE customers SET name = ?, email = ?, emailVerified = ?, image = ? WHERE id = ?'
            ).bind(
                Object.hasOwn(user, 'name') ? user.name ?? null : existingCustomer.name ?? null,
                Object.hasOwn(user, 'email') ? user.email : existingCustomer.email,
                emailVerified,
                Object.hasOwn(user, 'image') ? user.image ?? null : existingCustomer.image ?? null,
                user.id,
            ).run();
            const row = await db.prepare(
                'SELECT id, name, email, emailVerified, image FROM customers WHERE id = ?'
            ).bind(user.id).first<Record<string, unknown>>();
            return toUser(row)!;
        },

        async deleteUser(userId) {
            await db.prepare('DELETE FROM auth_users WHERE id = ?').bind(userId).run();
            await db.prepare('DELETE FROM accounts WHERE userId = ?').bind(userId).run();
            await db.prepare('DELETE FROM sessions WHERE userId = ?').bind(userId).run();
            return null;
        },

        async linkAccount(account) {
            const id = crypto.randomUUID();
            await db.prepare(
                `INSERT INTO accounts (id, userId, type, provider, providerAccountId,
                 refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                id,
                account.userId,
                account.type,
                account.provider,
                account.providerAccountId,
                account.refresh_token ?? null,
                account.access_token ?? null,
                account.expires_at ?? null,
                account.token_type ?? null,
                account.scope ?? null,
                account.id_token ?? null,
                account.session_state ?? null,
            ).run();
            return { ...account, id };
        },

        async unlinkAccount({ providerAccountId, provider }) {
            await db.prepare(
                'DELETE FROM accounts WHERE providerAccountId = ? AND provider = ?'
            ).bind(providerAccountId, provider).run();
        },

        async createSession(session) {
            const id = crypto.randomUUID();
            await db.prepare(
                'INSERT INTO sessions (id, sessionToken, userId, expires) VALUES (?, ?, ?, ?)'
            ).bind(
                id,
                session.sessionToken,
                session.userId,
                session.expires.toISOString(),
            ).run();
            const row = await db.prepare(
                'SELECT sessionToken, userId, expires FROM sessions WHERE sessionToken = ?'
            ).bind(session.sessionToken).first<Record<string, unknown>>();
            return toSession(row)!;
        },

        async getSessionAndUser(sessionToken) {
            const session = await db.prepare(
                'SELECT sessionToken, userId, expires FROM sessions WHERE sessionToken = ?'
            ).bind(sessionToken).first<Record<string, unknown>>();
            if (!session) return null;
            const parsedSession = toSession(session);
            if (!parsedSession) return null;
            let userRow = await db.prepare(
                'SELECT id, name, email, emailVerified, image FROM auth_users WHERE id = ?'
            ).bind(parsedSession.userId).first<Record<string, unknown>>();
            if (!userRow) {
                userRow = await db.prepare(
                    'SELECT id, name, email, emailVerified, image FROM customers WHERE id = ?'
                ).bind(parsedSession.userId).first<Record<string, unknown>>();
            }
            const user = toUser(userRow);
            if (!user) return null;
            return { session: parsedSession, user };
        },

        async updateSession(session) {
            const row = await db.prepare(
                'SELECT sessionToken, userId, expires FROM sessions WHERE sessionToken = ?'
            ).bind(session.sessionToken).first<Record<string, unknown>>();
            if (!row) return null;
            await db.prepare(
                'UPDATE sessions SET expires = ? WHERE sessionToken = ?'
            ).bind(
                session.expires?.toISOString() ?? row.expires,
                session.sessionToken,
            ).run();
            const updated = await db.prepare(
                'SELECT sessionToken, userId, expires FROM sessions WHERE sessionToken = ?'
            ).bind(session.sessionToken).first<Record<string, unknown>>();
            return toSession(updated);
        },

        async deleteSession(sessionToken) {
            await db.prepare(
                'DELETE FROM sessions WHERE sessionToken = ?'
            ).bind(sessionToken).run();
            return null;
        },

        async createVerificationToken(verificationToken) {
            await db.prepare(
                'INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)'
            ).bind(
                verificationToken.identifier,
                verificationToken.token,
                verificationToken.expires.toISOString(),
            ).run();
            return verificationToken;
        },

        async useVerificationToken({ identifier, token }) {
            const vt = await db.prepare(
                'SELECT identifier, token, expires FROM verification_tokens WHERE identifier = ? AND token = ?'
            ).bind(identifier, token).first<Record<string, unknown>>();
            if (!vt) return null;
            await db.prepare(
                'DELETE FROM verification_tokens WHERE identifier = ? AND token = ?'
            ).bind(identifier, token).run();
            return {
                identifier: vt.identifier as string,
                token: vt.token as string,
                expires: new Date(vt.expires as string),
            };
        },
    };
}
