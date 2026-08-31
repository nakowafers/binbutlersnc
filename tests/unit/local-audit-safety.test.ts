import { describe, expect, it } from 'vitest';
import { assertLocalOnlyAuditArguments, assertLocalReadOnlyAuditArguments, optionValue } from '../../scripts/local-audit';

describe('local audit entrypoint helpers', () => {
    it.each(['--apply', '--apply=true', '--remote', '--production', '--env'])('permanently rejects unsafe option %s', (unsafe) => {
        expect(() => assertLocalReadOnlyAuditArguments([unsafe], ['--db'])).toThrow(/read-only|local SQLite/i);
    });

    it('requires values for supported local options', () => {
        expect(() => optionValue(['--db'], '--db')).toThrow('--db requires a value');
    });

    it('allows only explicit local audit options', () => {
        expect(() => assertLocalReadOnlyAuditArguments(['--db', 'fixture.sqlite'], ['--db'])).not.toThrow();
        expect(() => assertLocalReadOnlyAuditArguments(['--unknown'], ['--db'])).toThrow('Unsupported audit option');
        expect(() => assertLocalReadOnlyAuditArguments(['--db=fixture.sqlite'], ['--db'])).toThrow('Inline audit option values');
    });

    it('allows an explicit persistence flag only for a local-only audit', () => {
        expect(() => assertLocalOnlyAuditArguments(
            ['--db', 'fixture.sqlite', '--persist-local-needs-review'],
            ['--db', '--persist-local-needs-review'],
        )).not.toThrow();
        expect(() => assertLocalOnlyAuditArguments(
            ['--persist-local-needs-review', '--remote'],
            ['--persist-local-needs-review'],
        )).toThrow('local SQLite');
        expect(() => assertLocalReadOnlyAuditArguments(
            ['--persist-local-needs-review'],
            ['--persist-local-needs-review'],
        )).toThrow('permanently read-only');
    });
});
