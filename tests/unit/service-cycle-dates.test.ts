import { describe, expect, it } from 'vitest';
import { actualServiceDate, assertEasternServiceDate, dispatchTargetDate, earliestBookableDate } from '@/lib/service-cycle/dates';

describe('Service Cycle Eastern date semantics', () => {
    it('keeps actual service, booking cutoff, and dispatch target concepts distinct across DST', () => {
        const beforeCutoff = new Date('2026-03-08T20:59:00.000Z'); // 16:59 EDT
        const afterCutoff = new Date('2026-03-08T21:00:00.000Z'); // 17:00 EDT

        expect(actualServiceDate(beforeCutoff)).toBe('2026-03-08');
        expect(earliestBookableDate(beforeCutoff)).toBe('2026-03-08');
        expect(earliestBookableDate(afterCutoff)).toBe('2026-03-09');
        expect(dispatchTargetDate(afterCutoff)).toBe('2026-03-09');
    });

    it('uses the current Eastern calendar date for actual service without a booking cutoff', () => {
        const instant = new Date('2026-11-01T04:30:00.000Z'); // 00:30 EDT before fall-back
        expect(actualServiceDate(instant)).toBe('2026-11-01');
    });

    it('rejects malformed or impossible canonical dates', () => {
        expect(() => assertEasternServiceDate('2026-02-30')).toThrow('canonical Eastern Service Date');
        expect(() => assertEasternServiceDate('09/01/2026')).toThrow('canonical Eastern Service Date');
    });
});
