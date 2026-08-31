import { describe, expect, it } from 'vitest';
import { buildCycleShadowParityReport } from '@/lib/reports/serviceCycleShadowParity';

describe('Service Cycle shadow parity', () => {
    it.each([
        [28, '2026-09-01', '2026-09-29'],
        [56, '2026-08-04', '2026-09-29'],
        [84, '2026-07-07', '2026-09-29'],
    ])('recognizes the exact %i-day anchor anniversary', (frequencyDays, serviceCycleAnchor, targetCycleDueDate) => {
        const report = buildCycleShadowParityReport({
            targetCycleDueDate,
            legacySelectedSubscriptionIds: [`sub_${frequencyDays}`],
            subscriptions: [{
                subscriptionId: `sub_${frequencyDays}`,
                frequencyDays,
                serviceCycleAnchor,
                completedServiceDates: ['2026-09-28T23:59:59.999Z'],
            }],
        });

        expect(report.differences).toEqual([]);
        expect(report.malformedCompletionValueCount).toBe(1);
    });

    it('uses the stable anchor rather than timestamp-shaped completion history to identify an aligned due date', () => {
        const report = buildCycleShadowParityReport({
            targetCycleDueDate: '2026-09-29',
            legacySelectedSubscriptionIds: ['sub_aligned'],
            subscriptions: [{
                subscriptionId: 'sub_aligned',
                frequencyDays: 28,
                serviceCycleAnchor: '2026-09-01',
                completedServiceDates: ['2026-09-01T17:32:10.000Z'],
            }],
        });

        expect(report.differences).toEqual([]);
        expect(report.malformedCompletionValueCount).toBe(1);
    });

    it('reports PII-free missing, extra, date-shifted, and review-required differences', () => {
        const report = buildCycleShadowParityReport({
            targetCycleDueDate: '2026-09-29',
            legacySelectedSubscriptionIds: ['sub_extra', 'sub_shifted'],
            subscriptions: [
                { subscriptionId: 'sub_missing', frequencyDays: 28, serviceCycleAnchor: '2026-09-01' },
                { subscriptionId: 'sub_extra', frequencyDays: 28, serviceCycleAnchor: '2026-09-02' },
                { subscriptionId: 'sub_shifted', frequencyDays: 28, serviceCycleAnchor: '2026-09-26' },
                { subscriptionId: 'sub_review', frequencyDays: 56, serviceCycleAnchor: 'not-a-date', completedServiceDates: ['broken-value'] },
            ],
        });

        expect(report.differences).toEqual(expect.arrayContaining([
            { subscriptionId: 'sub_missing', kind: 'missing', expectedCycleDueDate: '2026-09-29' },
            { subscriptionId: 'sub_extra', kind: 'extra', expectedCycleDueDate: '2026-09-02' },
            { subscriptionId: 'sub_shifted', kind: 'date_shifted', expectedCycleDueDate: '2026-09-26' },
            { subscriptionId: 'sub_review', kind: 'review_required', expectedCycleDueDate: null },
        ]));
        expect(report.malformedCompletionValueCount).toBe(1);
        expect(JSON.stringify(report)).not.toContain('broken-value');
    });
});
