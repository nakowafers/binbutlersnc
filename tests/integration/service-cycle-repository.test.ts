import { beforeEach, describe, expect, it } from 'vitest';
import { D1ServiceCycleRepositoryAdapter } from '@/lib/db/adapters/D1ServiceCycleRepositoryAdapter';
import { DbSimulator } from './db-simulator';

describe('D1 Service Cycle repository', () => {
    let simulator: DbSimulator;
    let repository: D1ServiceCycleRepositoryAdapter;

    beforeEach(() => {
        simulator = new DbSimulator();
        simulator.db.prepare('INSERT INTO customers (id, email) VALUES (?, ?)').run('customer_cycle', 'cycle@example.com');
        simulator.db.prepare('INSERT INTO subscriptions (id, customer_id, status, frequency_days) VALUES (?, ?, ?, ?)').run('subscription_cycle', 'customer_cycle', 'active', 28);
        repository = new D1ServiceCycleRepositoryAdapter(simulator as unknown as D1Database);
    });

    const createInput = () => ({
        id: 'cycle_1', subscriptionId: 'subscription_cycle', cycleDueDate: '2026-09-01',
        actor: { id: 'operator_1', capacity: 'system' as const }, occurredAt: '2026-08-31T23:00:00.000Z',
        correlationKey: 'cycle-create-1', eventId: 'event_create_1',
    });

    it('creates the obligation and its audit event atomically', async () => {
        const cycle = await repository.createCycle(createInput());
        expect(cycle).toMatchObject({ id: 'cycle_1', state: 'open', cycle_due_date: '2026-09-01' });
        expect(await repository.getEvents(cycle.id)).toMatchObject([{ event_type: 'created', to_state: 'open', actor_capacity: 'system' }]);
    });

    it('is idempotent for a repeated correlation key', async () => {
        await repository.createCycle(createInput());
        const replay = await repository.createCycle({ ...createInput(), id: 'cycle_different', eventId: 'event_different' });
        expect(replay.id).toBe('cycle_1');
        expect(simulator.db.prepare('SELECT * FROM service_cycles').all()).toHaveLength(1);
        expect(simulator.db.prepare('SELECT * FROM service_cycle_events').all()).toHaveLength(1);
    });

    it('rejects database-level event updates and preserves the original evidence', async () => {
        await repository.createCycle(createInput());
        const original = simulator.db.prepare('SELECT * FROM service_cycle_events WHERE id = ?').get('event_create_1');

        expect(() => simulator.db.prepare('UPDATE service_cycle_events SET notes = ? WHERE id = ?').run('tampered', 'event_create_1'))
            .toThrow('Service Cycle events are append-only');
        expect(simulator.db.prepare('SELECT * FROM service_cycle_events WHERE id = ?').get('event_create_1')).toEqual(original);
    });

    it('rejects database-level event deletes and preserves the original evidence', async () => {
        await repository.createCycle(createInput());
        const original = simulator.db.prepare('SELECT * FROM service_cycle_events WHERE id = ?').get('event_create_1');

        expect(() => simulator.db.prepare('DELETE FROM service_cycle_events WHERE id = ?').run('event_create_1'))
            .toThrow('Service Cycle events are append-only');
        expect(simulator.db.prepare('SELECT * FROM service_cycle_events WHERE id = ?').get('event_create_1')).toEqual(original);
    });

    it('rejects a duplicate subscription obligation and rolls back its event', async () => {
        await repository.createCycle(createInput());
        await expect(repository.createCycle({ ...createInput(), id: 'cycle_duplicate', eventId: 'event_duplicate', correlationKey: 'cycle-create-duplicate' }))
            .rejects.toThrow();
        expect(simulator.db.prepare('SELECT * FROM service_cycles').all()).toHaveLength(1);
        expect(simulator.db.prepare('SELECT * FROM service_cycle_events').all()).toHaveLength(1);
    });

    it('rolls back the cycle when its paired event is invalid', async () => {
        await repository.createCycle(createInput());
        await expect(repository.createCycle({ ...createInput(), id: 'cycle_transaction_failure', cycleDueDate: '2026-09-29', eventId: 'event_create_1', correlationKey: 'transaction-failure' }))
            .rejects.toThrow();
        expect(simulator.db.prepare('SELECT * FROM service_cycles').all()).toHaveLength(1);
        expect(simulator.db.prepare('SELECT * FROM service_cycle_events').all()).toHaveLength(1);
    });

    it('enforces transitions, append-only events, waiver capacity, and audited terminal correction', async () => {
        await repository.createCycle(createInput());
        await repository.transitionCycle({
            cycleId: 'cycle_1', toState: 'exception', actor: { id: 'operator_2', capacity: 'fulfillment' },
            occurredAt: '2026-09-01T17:00:00.000Z', correlationKey: 'exception-1', eventId: 'event_exception_1', reason: 'bins_not_out',
        });
        await expect(repository.transitionCycle({
            cycleId: 'cycle_1', toState: 'waived', actor: { id: 'operator_2', capacity: 'fulfillment' },
            occurredAt: '2026-09-01T18:00:00.000Z', correlationKey: 'waive-denied', eventId: 'event_waive_denied', reason: 'customer_request', notes: 'Asked to skip',
        })).rejects.toThrow('Only administration');
        await repository.transitionCycle({
            cycleId: 'cycle_1', toState: 'waived', actor: { id: 'operator_3', capacity: 'administration' },
            occurredAt: '2026-09-01T18:00:00.000Z', correlationKey: 'waive-1', eventId: 'event_waive_1', reason: 'customer_request', notes: 'Customer asked to waive this obligation',
        });
        await expect(repository.transitionCycle({
            cycleId: 'cycle_1', toState: 'open', actor: { id: 'operator_3', capacity: 'administration' },
            occurredAt: '2026-09-02T12:00:00.000Z', correlationKey: 'rollback-denied', eventId: 'event_rollback_denied', reason: 'customer_request', notes: 'No correction reason',
        })).rejects.toThrow('Invalid Service Cycle transition');
        const corrected = await repository.transitionCycle({
            cycleId: 'cycle_1', toState: 'open', actor: { id: 'operator_3', capacity: 'administration' },
            occurredAt: '2026-09-02T12:00:00.000Z', correlationKey: 'correction-1', eventId: 'event_correction_1', reason: 'data_integrity', notes: 'Waiver was recorded against the wrong customer',
        });
        expect(corrected.state).toBe('open');
        expect(await repository.getEvents('cycle_1')).toHaveLength(4);
        expect((await repository.getEvents('cycle_1')).at(-1)).toMatchObject({ event_type: 'correction', reason: 'data_integrity' });
    });

    it('requires notes for other reasons and every waiver', async () => {
        await repository.createCycle(createInput());
        await expect(repository.transitionCycle({
            cycleId: 'cycle_1', toState: 'exception', actor: { id: 'operator_2', capacity: 'fulfillment' },
            occurredAt: '2026-09-01T17:00:00.000Z', correlationKey: 'other-no-notes', eventId: 'event_other_no_notes', reason: 'other',
        })).rejects.toThrow('Notes are required');
    });
});
