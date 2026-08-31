import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(path.resolve(import.meta.dirname, '../../migrations/0023_add_service_cycle_foundation.sql'), 'utf8');
const trigger = migration.match(/CREATE TRIGGER service_cycle_event_matches_current_state[\s\S]*?END;/)?.[0];

describe('service-cycle event trigger migration contract', () => {
    it('uses SQLite-supported SELECT RAISE WHERE guards instead of CASE expressions', () => {
        expect(trigger).toBeDefined();
        expect(trigger).not.toMatch(/CASE\s+WHEN[\s\S]*?RAISE[\s\S]*?END/i);
        expect(trigger).toMatch(/SELECT\s+RAISE\(ABORT, 'Service Cycle event target does not match current state'\)\s+WHERE/i);
        expect(trigger).toMatch(/SELECT\s+RAISE\(ABORT, 'Service Cycle event source does not match latest event'\)\s+WHERE/i);
    });
});
