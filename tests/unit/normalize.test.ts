import { describe, it, expect } from 'vitest';
import { normalizeEmail, normalizeAddress } from '../../src/lib/utils';

describe('normalizeEmail', () => {
    it('lowercases mixed case', () => {
        expect(normalizeEmail('Foo@Bar.com')).toBe('foo@bar.com');
    });

    it('trims leading and trailing whitespace', () => {
        expect(normalizeEmail('  foo@bar.com  ')).toBe('foo@bar.com');
    });

    it('lowercases and trims together', () => {
        expect(normalizeEmail(' Foo@Bar.COM\t')).toBe('foo@bar.com');
    });

    it('leaves already-canonical emails unchanged', () => {
        expect(normalizeEmail('foo@bar.com')).toBe('foo@bar.com');
    });
});

describe('normalizeAddress', () => {
    it('lowercases mixed case', () => {
        expect(normalizeAddress('123 Main ST')).toBe('123 main st');
    });

    it('trims leading and trailing whitespace', () => {
        expect(normalizeAddress('  123 Main St  ')).toBe('123 main st');
    });

    it('collapses runs of internal whitespace to a single space', () => {
        expect(normalizeAddress('123  Main    St')).toBe('123 main st');
    });

    it('treats tabs and newlines as whitespace', () => {
        expect(normalizeAddress('123\tMain\nSt')).toBe('123 main st');
    });

    it('handles casing, whitespace, and tabs together', () => {
        expect(normalizeAddress('  123 MAIN St,\tRaleigh  NC ')).toBe('123 main st, raleigh nc');
    });
});
