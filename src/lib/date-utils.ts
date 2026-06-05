const SAME_DAY_CUTOFF_HOUR = 20;

const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const hourFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });

const TRASH_DAY_MAP: Record<string, number> = { 'SUN': 0, 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6 };

export function getTodayDateString(): string {
    const now = new Date();
    const localDate = dateFormatter.format(now);
    const localHour = parseInt(hourFormatter.format(now), 10);

    if (localHour >= SAME_DAY_CUTOFF_HOUR) {
        const tomorrow = new Date(`${localDate}T12:00:00`);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    }

    return localDate;
}

export function isToday(dateStr: string): boolean {
    return dateStr === getTodayDateString();
}

export function isSameDayOrPast(dateStr: string): boolean {
    const today = getTodayDateString();
    return dateStr <= today;
}

export function getEndOfDayTimestamp(dateStr: string): number {
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
    return Math.floor(endOfDay.getTime() / 1000);
}

export function addDaysToDateString(dateStr: string, days: number): string {
    const date = new Date(`${dateStr}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
}

export function getRecurringBillingStartTimestamp(firstServiceDate: string, frequencyDays: number): number {
    return getEndOfDayTimestamp(addDaysToDateString(firstServiceDate, frequencyDays));
}

export function getMinimumDate(): string {
    return getTodayDateString();
}

export function getMaximumDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 180);
    return date.toISOString().split('T')[0];
}

export function isValidBookingRange(dateStr: string): boolean {
    const min = getMinimumDate();
    const max = getMaximumDate();
    return dateStr >= min && dateStr <= max;
}

export function isTrashDayMatch(dateStr: string, trashDay: string): boolean {
    const date = new Date(`${dateStr}T12:00:00Z`);
    const dayOfWeek = date.getUTCDay();
    const targetDay = TRASH_DAY_MAP[trashDay.toUpperCase()];
    if (targetDay === undefined) return false;
    return dayOfWeek === targetDay;
}

export function isWeekday(dateStr: string): boolean {
    const date = new Date(`${dateStr}T12:00:00Z`);
    const day = date.getUTCDay();
    return day >= 1 && day <= 5;
}

export function getDisabledDays(trashDay?: string): (date: Date) => boolean {
    return (date: Date) => {
        const dateStr = date.toISOString().split('T')[0];
        if (!isValidBookingRange(dateStr)) return true;
        if (trashDay) return !isTrashDayMatch(dateStr, trashDay);
        return !isWeekday(dateStr);
    };
}
