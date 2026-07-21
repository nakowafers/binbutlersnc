import { describe, it, expect } from 'vitest';
import { DispatchPlanner } from '../../src/lib/dispatch/DispatchPlanner';

describe('DispatchPlanner', () => {
    it('selects only tomorrow stops and applies the holiday offset', () => {
        const planner = new DispatchPlanner();
        const now = new Date('2024-05-13T12:00:00Z');

        const plan = planner.planDueDispatches(now, [
            {
                id: 'sub_tue',
                customer_id: 'cust_tue',
                raw_address: '123 Tomorrow St',
                latitude: 35.1,
                longitude: -80.1,
                service_day: 'TUE',
                email: 'tue@example.com',
                bin_quantity: 2,
            } as any,
            {
                id: 'sub_wed',
                customer_id: 'cust_wed',
                raw_address: '456 Later St',
                latitude: 35.2,
                longitude: -80.2,
                service_day: 'WED',
                email: 'wed@example.com',
                bin_quantity: 1,
            } as any,
        ], 24);

        expect(plan.date).toBe('2024-05-15');
        expect(plan.stops).toHaveLength(1);
        expect(plan.stops[0].subscription_id).toBe('sub_tue');
        expect(plan.stops[0].address).toBe('123 Tomorrow St');
    });
});
