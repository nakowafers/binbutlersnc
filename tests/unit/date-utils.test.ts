import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getTodayDateString,
    isToday,
    isSameDayOrPast,
    getEndOfDayTimestamp,
    addDaysToDateString,
    getRecurringBillingStartTimestamp,
    getMinimumDate,
    getMaximumDate,
    isValidBookingRange,
    isTrashDayMatch,
    isWeekday,
} from '../../src/lib/date-utils';

describe('date-utils', () => {
    describe('getTodayDateString', () => {
        it('should return today in YYYY-MM-DD format', () => {
            const result = getTodayDateString();
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('should return today before 8 PM EST cutoff', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-01-15T23:59:00Z')); // 6:59 PM EST
            expect(getTodayDateString()).toBe('2026-01-15');
            vi.useRealTimers();
        });

        it('should return tomorrow after 8 PM EST cutoff', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-01-16T01:01:00Z')); // 8:01 PM EST on Jan 15
            expect(getTodayDateString()).toBe('2026-01-16');
            vi.useRealTimers();
        });

        it('should return today at exactly 7:59 PM EST', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-01-16T00:59:00Z')); // 7:59 PM EST on Jan 15
            expect(getTodayDateString()).toBe('2026-01-15');
            vi.useRealTimers();
        });

        it('should return tomorrow at exactly 8:00 PM EST', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-01-16T01:00:00Z')); // 8:00 PM EST on Jan 15
            expect(getTodayDateString()).toBe('2026-01-16');
            vi.useRealTimers();
        });

        it('should handle EDT (daylight time) correctly', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-15T23:59:00Z')); // 7:59 PM EDT
            expect(getTodayDateString()).toBe('2026-06-15');
            vi.useRealTimers();
        });

        it('should return tomorrow after 8 PM EDT', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-16T00:01:00Z')); // 8:01 PM EDT on Jun 15
            expect(getTodayDateString()).toBe('2026-06-16');
            vi.useRealTimers();
        });
    });

    describe('isToday', () => {
        it('should return true for today', () => {
            expect(isToday(getTodayDateString())).toBe(true);
        });

        it('should return false for yesterday', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            expect(isToday(yesterdayStr)).toBe(false);
        });

        it('should return false for tomorrow', () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];
            expect(isToday(tomorrowStr)).toBe(false);
        });
    });

    describe('isSameDayOrPast', () => {
        it('should return true for today', () => {
            expect(isSameDayOrPast(getTodayDateString())).toBe(true);
        });

        it('should return true for yesterday', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            expect(isSameDayOrPast(yesterday.toISOString().split('T')[0])).toBe(true);
        });

        it('should return false for tomorrow', () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            expect(isSameDayOrPast(tomorrow.toISOString().split('T')[0])).toBe(false);
        });
    });

    describe('getEndOfDayTimestamp', () => {
        it('should return a Unix timestamp for end of day in UTC', () => {
            const result = getEndOfDayTimestamp('2026-06-15');
            expect(result).toBe(1781567999);
        });

        it('should return a positive integer for today', () => {
            const result = getEndOfDayTimestamp(getTodayDateString());
            expect(Number.isInteger(result)).toBe(true);
            expect(result).toBeGreaterThan(0);
        });

        it('should return a greater timestamp for a later date', () => {
            const today = getEndOfDayTimestamp('2026-06-01');
            const later = getEndOfDayTimestamp('2026-06-15');
            expect(later).toBeGreaterThan(today);
        });
    });

    describe('addDaysToDateString', () => {
        it('should add days while preserving YYYY-MM-DD format', () => {
            expect(addDaysToDateString('2026-06-15', 28)).toBe('2026-07-13');
        });

        it('should handle year rollover', () => {
            expect(addDaysToDateString('2026-12-20', 28)).toBe('2027-01-17');
        });
    });

    describe('getRecurringBillingStartTimestamp', () => {
        it('should return end-of-day timestamp for the second monthly service date', () => {
            expect(getRecurringBillingStartTimestamp('2026-06-15', 28)).toBe(1783987199);
        });

        it('should return end-of-day timestamp for the second quarterly service date', () => {
            expect(getRecurringBillingStartTimestamp('2026-06-15', 84)).toBe(1788825599);
        });
    });

    describe('getMinimumDate', () => {
        it('should return today', () => {
            expect(getMinimumDate()).toBe(getTodayDateString());
        });
    });

    describe('getMaximumDate', () => {
        it('should return a date roughly 180 days from now', () => {
            const max = getMaximumDate();
            const min = getMinimumDate();

            const diffMs = new Date(max).getTime() - new Date(min).getTime();
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            expect(diffDays).toBe(180);
        });
    });

    describe('isValidBookingRange', () => {
        it('should return true for today', () => {
            expect(isValidBookingRange(getTodayDateString())).toBe(true);
        });

        it('should return true for 90 days from now', () => {
            const future = new Date();
            future.setDate(future.getDate() + 90);
            expect(isValidBookingRange(future.toISOString().split('T')[0])).toBe(true);
        });

        it('should return true for 180 days from now', () => {
            const future = new Date();
            future.setDate(future.getDate() + 180);
            expect(isValidBookingRange(future.toISOString().split('T')[0])).toBe(true);
        });

        it('should return false for 181 days from now', () => {
            const future = new Date();
            future.setDate(future.getDate() + 181);
            expect(isValidBookingRange(future.toISOString().split('T')[0])).toBe(false);
        });

        it('should return false for yesterday', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            expect(isValidBookingRange(yesterday.toISOString().split('T')[0])).toBe(false);
        });
    });

    describe('isTrashDayMatch', () => {
        it('should return true when date matches MON', () => {
            // 2026-06-01 is a Monday
            expect(isTrashDayMatch('2026-06-01', 'MON')).toBe(true);
        });

        it('should return false when date does not match MON', () => {
            // 2026-06-02 is a Tuesday
            expect(isTrashDayMatch('2026-06-02', 'MON')).toBe(false);
        });

        it('should return true when date matches FRI', () => {
            // 2026-06-05 is a Friday
            expect(isTrashDayMatch('2026-06-05', 'FRI')).toBe(true);
        });

        it('should handle lowercase input', () => {
            // 2026-06-01 is a Monday
            expect(isTrashDayMatch('2026-06-01', 'mon')).toBe(true);
        });

        it('should return false for invalid trash day', () => {
            expect(isTrashDayMatch('2026-06-01', 'INVALID' as string)).toBe(false);
        });
    });

    describe('isWeekday', () => {
        it('should return true for Monday', () => {
            // 2026-06-01 is a Monday
            expect(isWeekday('2026-06-01')).toBe(true);
        });

        it('should return true for Friday', () => {
            // 2026-06-05 is a Friday
            expect(isWeekday('2026-06-05')).toBe(true);
        });

        it('should return false for Saturday', () => {
            // 2026-06-06 is a Saturday
            expect(isWeekday('2026-06-06')).toBe(false);
        });

        it('should return false for Sunday', () => {
            // 2026-06-07 is a Sunday
            expect(isWeekday('2026-06-07')).toBe(false);
        });
    });
});
