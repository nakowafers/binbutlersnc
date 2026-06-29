import { DueSubscriptionResult, PendingDispatchResult } from '../db/types';

export interface PlannedDispatchCandidate {
    address: string;
    lat?: number;
    lng?: number;
    customer_id: string;
    subscription_id: string;
    bin_quantity?: number;
}

export interface PlannedDispatchBatch {
    date: string;
    stops: PlannedDispatchCandidate[];
}

export class DispatchPlanner {
    planDueDispatches(now: Date, results: DueSubscriptionResult[], holidayOffsetHours: number): PlannedDispatchBatch {
        const daysMap: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
        const stops: PlannedDispatchCandidate[] = [];
        let tomorrowDate = '';

        for (const row of results) {
            const serviceDay = (row.service_day || 'MON').toUpperCase();
            const target = daysMap[serviceDay] ?? 1;
            const today = now.getDay();
            let daysUntil = target - today;
            if (daysUntil <= 0) daysUntil += 7;

            if (daysUntil !== 1) continue;

            const serviceDate = new Date(now);
            serviceDate.setDate(serviceDate.getDate() + 1);
            serviceDate.setHours(serviceDate.getHours() + holidayOffsetHours);
            tomorrowDate = serviceDate.toISOString().split('T')[0];

            stops.push({
                address: row.raw_address,
                lat: row.latitude || undefined,
                lng: row.longitude || undefined,
                customer_id: row.customer_id,
                subscription_id: row.id,
                bin_quantity: row.bin_quantity ?? undefined,
            });
        }

        return { date: tomorrowDate, stops };
    }

    planRetryDispatch(row: PendingDispatchResult): PlannedDispatchBatch {
        return {
            date: row.service_date.split('T')[0],
            stops: [{
                address: row.raw_address,
                lat: row.latitude || undefined,
                lng: row.longitude || undefined,
                customer_id: row.customer_id,
                subscription_id: row.subscription_id,
            }],
        };
    }
}
