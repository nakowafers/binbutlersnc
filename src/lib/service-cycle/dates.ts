export const SERVICE_CYCLE_TIME_ZONE = 'America/New_York';
export type EasternServiceDate = string & { readonly __easternServiceDate: unique symbol };

export function assertEasternServiceDate(value: string): asserts value is EasternServiceDate {
    const parsed = new Date(`${value}T12:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new Error('A canonical Eastern Service Date (YYYY-MM-DD) is required');
    }
}

function easternParts(instant: Date): Record<string, string> {
    if (Number.isNaN(instant.getTime())) throw new Error('A valid instant is required');
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: SERVICE_CYCLE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(instant).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
}

export function actualServiceDate(instant: Date): EasternServiceDate {
    const { year, month, day } = easternParts(instant);
    return `${year}-${month}-${day}` as EasternServiceDate;
}

export function dispatchTargetDate(instant: Date): EasternServiceDate {
    return addEasternDays(actualServiceDate(instant), 1);
}

export function earliestBookableDate(instant: Date, cutoffHourEastern = 17): EasternServiceDate {
    if (!Number.isInteger(cutoffHourEastern) || cutoffHourEastern < 0 || cutoffHourEastern > 23) {
        throw new Error('Eastern booking cutoff must be an hour from 0 through 23');
    }
    const hour = Number(new Intl.DateTimeFormat('en-US', {
        timeZone: SERVICE_CYCLE_TIME_ZONE, hour: '2-digit', hourCycle: 'h23',
    }).format(instant));
    const date = actualServiceDate(instant);
    return hour >= cutoffHourEastern ? addEasternDays(date, 1) : date;
}

export function addEasternDays(date: EasternServiceDate, days: number): EasternServiceDate {
    assertEasternServiceDate(date);
    if (!Number.isInteger(days)) throw new Error('An integer day offset is required');
    const parsed = new Date(`${date}T12:00:00.000Z`);
    parsed.setUTCDate(parsed.getUTCDate() + days);
    return parsed.toISOString().slice(0, 10) as EasternServiceDate;
}

export function firstServiceDayOnOrAfter(date: EasternServiceDate, serviceDay: string): EasternServiceDate {
    assertEasternServiceDate(date);
    const targetDay = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].indexOf(serviceDay.toUpperCase());
    if (targetDay < 0) throw new Error('A valid Service Day is required');

    const currentDay = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    return addEasternDays(date, (targetDay - currentDay + 7) % 7);
}
