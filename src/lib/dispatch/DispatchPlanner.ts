import { DueSubscriptionResult } from '../db/types';
import { addDaysToDateString } from '../date-utils';

export interface PlannedDispatchCandidate {
    address: string;
    lat?: number;
    lng?: number;
    customer_id: string;
    subscription_id: string;
    bin_quantity?: number;
    customer_name?: string | null;
    customer_phone?: string | null;
    service_notes?: string | null;
    customer_scent?: string | null;
    first_service_date?: string | null;
    frequency_days?: number;
    service_cycle_id?: string | null;
    cycle_due_date?: string | null;
}

export interface PlannedDispatchBatch {
    date: string;
    stops: PlannedDispatchCandidate[];
}

const easternDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const serviceDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function holidayOffsetHoursToServiceDateDays(holidayOffsetHours: number): number {
    if (!Number.isFinite(holidayOffsetHours)) return 0;
    return Math.trunc(holidayOffsetHours / 24);
}

export class DispatchPlanner {
    getTargetServiceDate(now: Date, holidayOffsetHours: number): string {
        const targetServiceDayDate = this.getTargetServiceDayDate(now);
        return addDaysToDateString(targetServiceDayDate, holidayOffsetHoursToServiceDateDays(holidayOffsetHours));
    }

    getTargetCycleDueDate(now: Date): string {
        return this.getTargetServiceDayDate(now);
    }

    planDueDispatches(now: Date, results: DueSubscriptionResult[], holidayOffsetHours: number): PlannedDispatchBatch {
        const stops: PlannedDispatchCandidate[] = [];
        const targetServiceDayDate = this.getTargetServiceDayDate(now);
        const targetServiceDate = this.getTargetServiceDate(now, holidayOffsetHours);
        const targetServiceDay = serviceDays[new Date(`${targetServiceDayDate}T12:00:00Z`).getUTCDay()];

        for (const row of results) {
            const normalizedServiceDay = (row.service_day || 'MON').toUpperCase();
            const serviceDay = serviceDays.includes(normalizedServiceDay) ? normalizedServiceDay : 'MON';
            if (serviceDay !== targetServiceDay) continue;

            stops.push({
                address: row.raw_address,
                lat: row.latitude || undefined,
                lng: row.longitude || undefined,
                customer_id: row.customer_id,
                subscription_id: row.id,
                bin_quantity: row.bin_quantity ?? undefined,
                customer_name: row.name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
                customer_phone: row.phone_number || null,
                service_notes: row.notes || null,
                customer_scent: row.scent_preference || null,
                first_service_date: row.next_service_date || null,
                frequency_days: row.frequency_days,
                service_cycle_id: row.service_cycle_id || null,
                cycle_due_date: row.cycle_due_date || null,
            });
        }

        return { date: stops.length ? targetServiceDate : '', stops };
    }

    private getTargetServiceDayDate(now: Date): string {
        const easternToday = easternDateFormatter.format(now);
        return addDaysToDateString(easternToday, 1);
    }
}
