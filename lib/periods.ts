/**
 * Pure Period Engine (`lib/periods.ts`)
 * - All period calculations strictly operate in the `Asia/Jakarta` timezone (UTC+07:00, DST-free).
 * - Weeks start on Monday (`Senin` = day 0 in ISO week offset).
 * - Handles 28/29/30/31-day months, leap years, and year transitions deterministically.
 */

export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'this_week'
  | 'last_week'
  | 'last_14_days'
  | 'first_half_month'
  | 'second_half_month'
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'this_year'
  | 'last_year'
  | 'custom';

export interface PeriodWindow {
  preset: PeriodPreset;
  label: string;
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  kind: 'rolling' | 'calendar';
  totalDays: number;
  elapsedDays: number;
}

export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Hari ini',
  yesterday: 'Kemarin',
  last_7_days: '7 hari terakhir',
  this_week: 'Minggu ini (Senin–Minggu)',
  last_week: 'Minggu sebelumnya',
  last_14_days: '14 hari terakhir',
  first_half_month: '2 minggu pertama (Tgl 1–14)',
  second_half_month: '2 minggu terakhir (Tgl 15–Akhir)',
  this_month: 'Bulan ini',
  last_month: 'Bulan sebelumnya',
  last_3_months: '3 bulan terakhir',
  last_6_months: '6 bulan terakhir',
  this_year: 'Tahun ini',
  last_year: 'Tahun sebelumnya',
  custom: 'Rentang khusus',
};

export interface JakartaDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  hour: number; // 0-23
}

/**
 * Extracts calendar components in Asia/Jakarta (UTC+7) regardless of the host/browser local timezone.
 */
export function toJakartaParts(date: Date): JakartaDateParts {
  const shifted = new Date(date.getTime() + JAKARTA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
  };
}

/**
 * Constructs a UTC Date corresponding to `YYYY-MM-DD HH:mm:ss.sss` in Asia/Jakarta (UTC+07:00).
 */
export function fromJakartaCalendar(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
): Date {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms) - JAKARTA_OFFSET_MS;
  return new Date(utcMs);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
  const normalized = normalizeYearMonth(year, month);
  const y = normalized.year;
  const m = normalized.month;
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  if (m === 4 || m === 6 || m === 9 || m === 11) return 30;
  return 31;
}

export function normalizeYearMonth(year: number, month: number): { year: number; month: number } {
  const zeroIndexed = month - 1;
  const yearDelta = Math.floor(zeroIndexed / 12);
  const normalizedMonth = (((zeroIndexed % 12) + 12) % 12) + 1;
  return { year: year + yearDelta, month: normalizedMonth };
}

function startOfJakartaDay(year: number, month: number, day: number): Date {
  return fromJakartaCalendar(year, month, day, 0, 0, 0, 0);
}

function endOfJakartaDay(year: number, month: number, day: number): Date {
  return fromJakartaCalendar(year, month, day, 23, 59, 59, 999);
}

function addDaysJakarta(
  year: number,
  month: number,
  day: number,
  deltaDays: number
): { year: number; month: number; day: number } {
  const utcMid = Date.UTC(year, month - 1, day, 12, 0, 0, 0) + deltaDays * DAY_MS;
  const d = new Date(utcMid);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/**
 * Formats a Date to `YYYY-MM-DD` in Asia/Jakarta timezone.
 */
export function formatJakartaDateKey(date: Date): string {
  const { year, month, day } = toJakartaParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Formats a Date to Indonesian long date (`DD MMMM YYYY`) in Asia/Jakarta timezone.
 */
export function formatIndonesianDate(date: Date, includeTime = false): string {
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  };
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return new Intl.DateTimeFormat('id-ID', options).format(date);
}

/**
 * Resolves any of the 15 financial periods into exact UTC start/end timestamps
 * aligned to Asia/Jakarta boundaries, plus its corresponding previous comparison period.
 */
export function resolvePeriod(
  preset: PeriodPreset,
  referenceNow: Date = new Date(),
  customRange?: { startDateStr?: string; endDateStr?: string }
): PeriodWindow {
  const nowParts = toJakartaParts(referenceNow);
  const { year, month, day, dayOfWeek } = nowParts;
  // Monday = 0, Tuesday = 1, ..., Sunday = 6
  const mondayOffset = (dayOfWeek + 6) % 7;

  let start: Date;
  let end: Date;
  let previousStart: Date;
  let previousEnd: Date;
  let kind: 'rolling' | 'calendar' = 'calendar';

  switch (preset) {
    case 'today': {
      kind = 'calendar';
      start = startOfJakartaDay(year, month, day);
      end = endOfJakartaDay(year, month, day);
      const prev = addDaysJakarta(year, month, day, -1);
      previousStart = startOfJakartaDay(prev.year, prev.month, prev.day);
      previousEnd = endOfJakartaDay(prev.year, prev.month, prev.day);
      break;
    }

    case 'yesterday': {
      kind = 'calendar';
      const yest = addDaysJakarta(year, month, day, -1);
      start = startOfJakartaDay(yest.year, yest.month, yest.day);
      end = endOfJakartaDay(yest.year, yest.month, yest.day);
      const prev = addDaysJakarta(year, month, day, -2);
      previousStart = startOfJakartaDay(prev.year, prev.month, prev.day);
      previousEnd = endOfJakartaDay(prev.year, prev.month, prev.day);
      break;
    }

    case 'last_7_days': {
      kind = 'rolling';
      const startDay = addDaysJakarta(year, month, day, -6);
      start = startOfJakartaDay(startDay.year, startDay.month, startDay.day);
      end = endOfJakartaDay(year, month, day);
      const prevStartDay = addDaysJakarta(year, month, day, -13);
      const prevEndDay = addDaysJakarta(year, month, day, -7);
      previousStart = startOfJakartaDay(prevStartDay.year, prevStartDay.month, prevStartDay.day);
      previousEnd = endOfJakartaDay(prevEndDay.year, prevEndDay.month, prevEndDay.day);
      break;
    }

    case 'this_week': {
      kind = 'calendar';
      const mon = addDaysJakarta(year, month, day, -mondayOffset);
      const sun = addDaysJakarta(year, month, day, 6 - mondayOffset);
      start = startOfJakartaDay(mon.year, mon.month, mon.day);
      end = endOfJakartaDay(sun.year, sun.month, sun.day);
      const prevMon = addDaysJakarta(mon.year, mon.month, mon.day, -7);
      const prevSun = addDaysJakarta(sun.year, sun.month, sun.day, -7);
      previousStart = startOfJakartaDay(prevMon.year, prevMon.month, prevMon.day);
      previousEnd = endOfJakartaDay(prevSun.year, prevSun.month, prevSun.day);
      break;
    }

    case 'last_week': {
      kind = 'calendar';
      const lastMon = addDaysJakarta(year, month, day, -mondayOffset - 7);
      const lastSun = addDaysJakarta(year, month, day, -mondayOffset - 1);
      start = startOfJakartaDay(lastMon.year, lastMon.month, lastMon.day);
      end = endOfJakartaDay(lastSun.year, lastSun.month, lastSun.day);
      const prevMon = addDaysJakarta(lastMon.year, lastMon.month, lastMon.day, -7);
      const prevSun = addDaysJakarta(lastSun.year, lastSun.month, lastSun.day, -7);
      previousStart = startOfJakartaDay(prevMon.year, prevMon.month, prevMon.day);
      previousEnd = endOfJakartaDay(prevSun.year, prevSun.month, prevSun.day);
      break;
    }

    case 'last_14_days': {
      kind = 'rolling';
      const startDay = addDaysJakarta(year, month, day, -13);
      start = startOfJakartaDay(startDay.year, startDay.month, startDay.day);
      end = endOfJakartaDay(year, month, day);
      const prevStartDay = addDaysJakarta(year, month, day, -27);
      const prevEndDay = addDaysJakarta(year, month, day, -14);
      previousStart = startOfJakartaDay(prevStartDay.year, prevStartDay.month, prevStartDay.day);
      previousEnd = endOfJakartaDay(prevEndDay.year, prevEndDay.month, prevEndDay.day);
      break;
    }

    case 'first_half_month': {
      kind = 'calendar';
      start = startOfJakartaDay(year, month, 1);
      end = endOfJakartaDay(year, month, 14);
      const prevYm = normalizeYearMonth(year, month - 1);
      previousStart = startOfJakartaDay(prevYm.year, prevYm.month, 1);
      previousEnd = endOfJakartaDay(prevYm.year, prevYm.month, 14);
      break;
    }

    case 'second_half_month': {
      kind = 'calendar';
      const lastDayCurr = getDaysInMonth(year, month);
      start = startOfJakartaDay(year, month, 15);
      end = endOfJakartaDay(year, month, lastDayCurr);
      const prevYm = normalizeYearMonth(year, month - 1);
      const lastDayPrev = getDaysInMonth(prevYm.year, prevYm.month);
      previousStart = startOfJakartaDay(prevYm.year, prevYm.month, 15);
      previousEnd = endOfJakartaDay(prevYm.year, prevYm.month, lastDayPrev);
      break;
    }

    case 'this_month': {
      kind = 'calendar';
      const lastDayCurr = getDaysInMonth(year, month);
      start = startOfJakartaDay(year, month, 1);
      end = endOfJakartaDay(year, month, lastDayCurr);
      const prevYm = normalizeYearMonth(year, month - 1);
      const lastDayPrev = getDaysInMonth(prevYm.year, prevYm.month);
      previousStart = startOfJakartaDay(prevYm.year, prevYm.month, 1);
      previousEnd = endOfJakartaDay(prevYm.year, prevYm.month, lastDayPrev);
      break;
    }

    case 'last_month': {
      kind = 'calendar';
      const lastYm = normalizeYearMonth(year, month - 1);
      const lastDayLast = getDaysInMonth(lastYm.year, lastYm.month);
      start = startOfJakartaDay(lastYm.year, lastYm.month, 1);
      end = endOfJakartaDay(lastYm.year, lastYm.month, lastDayLast);
      const prevYm = normalizeYearMonth(year, month - 2);
      const lastDayPrev = getDaysInMonth(prevYm.year, prevYm.month);
      previousStart = startOfJakartaDay(prevYm.year, prevYm.month, 1);
      previousEnd = endOfJakartaDay(prevYm.year, prevYm.month, lastDayPrev);
      break;
    }

    case 'last_3_months': {
      kind = 'rolling';
      const startYm = normalizeYearMonth(year, month - 2);
      const lastDayCurr = getDaysInMonth(year, month);
      start = startOfJakartaDay(startYm.year, startYm.month, 1);
      end = endOfJakartaDay(year, month, lastDayCurr);

      const prevStartYm = normalizeYearMonth(year, month - 5);
      const prevEndYm = normalizeYearMonth(year, month - 3);
      const prevEndLastDay = getDaysInMonth(prevEndYm.year, prevEndYm.month);
      previousStart = startOfJakartaDay(prevStartYm.year, prevStartYm.month, 1);
      previousEnd = endOfJakartaDay(prevEndYm.year, prevEndYm.month, prevEndLastDay);
      break;
    }

    case 'last_6_months': {
      kind = 'rolling';
      const startYm = normalizeYearMonth(year, month - 5);
      const lastDayCurr = getDaysInMonth(year, month);
      start = startOfJakartaDay(startYm.year, startYm.month, 1);
      end = endOfJakartaDay(year, month, lastDayCurr);

      const prevStartYm = normalizeYearMonth(year, month - 11);
      const prevEndYm = normalizeYearMonth(year, month - 6);
      const prevEndLastDay = getDaysInMonth(prevEndYm.year, prevEndYm.month);
      previousStart = startOfJakartaDay(prevStartYm.year, prevStartYm.month, 1);
      previousEnd = endOfJakartaDay(prevEndYm.year, prevEndYm.month, prevEndLastDay);
      break;
    }

    case 'this_year': {
      kind = 'calendar';
      start = startOfJakartaDay(year, 1, 1);
      end = endOfJakartaDay(year, 12, 31);
      previousStart = startOfJakartaDay(year - 1, 1, 1);
      previousEnd = endOfJakartaDay(year - 1, 12, 31);
      break;
    }

    case 'last_year': {
      kind = 'calendar';
      start = startOfJakartaDay(year - 1, 1, 1);
      end = endOfJakartaDay(year - 1, 12, 31);
      previousStart = startOfJakartaDay(year - 2, 1, 1);
      previousEnd = endOfJakartaDay(year - 2, 12, 31);
      break;
    }

    case 'custom': {
      kind = 'rolling';
      const parseYmd = (str?: string): { year: number; month: number; day: number } | null => {
        if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
        const [y, m, d] = str.split('-').map(Number);
        return { year: y, month: m, day: d };
      };
      const parsedStart = parseYmd(customRange?.startDateStr) ?? { year, month, day: 1 };
      const parsedEnd = parseYmd(customRange?.endDateStr) ?? { year, month, day };

      const rawStart = startOfJakartaDay(parsedStart.year, parsedStart.month, parsedStart.day);
      const rawEnd = endOfJakartaDay(parsedEnd.year, parsedEnd.month, parsedEnd.day);
      start = rawStart.getTime() <= rawEnd.getTime() ? rawStart : startOfJakartaDay(parsedEnd.year, parsedEnd.month, parsedEnd.day);
      end = rawStart.getTime() <= rawEnd.getTime() ? rawEnd : endOfJakartaDay(parsedStart.year, parsedStart.month, parsedStart.day);

      const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime() + 1) / DAY_MS));
      const startParts = toJakartaParts(start);
      const prevStartParts = addDaysJakarta(startParts.year, startParts.month, startParts.day, -spanDays);
      const prevEndParts = addDaysJakarta(startParts.year, startParts.month, startParts.day, -1);
      previousStart = startOfJakartaDay(prevStartParts.year, prevStartParts.month, prevStartParts.day);
      previousEnd = endOfJakartaDay(prevEndParts.year, prevEndParts.month, prevEndParts.day);
      break;
    }
  }

  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime() + 1) / DAY_MS));
  const nowDayEnd = endOfJakartaDay(year, month, day);
  let elapsedDays = totalDays;
  if (nowDayEnd.getTime() < start.getTime()) {
    elapsedDays = 1;
  } else if (nowDayEnd.getTime() < end.getTime()) {
    elapsedDays = Math.max(1, Math.round((nowDayEnd.getTime() - start.getTime() + 1) / DAY_MS));
  }

  return {
    preset,
    label: PERIOD_LABELS[preset],
    start,
    end,
    previousStart,
    previousEnd,
    kind,
    totalDays,
    elapsedDays,
  };
}

/**
 * Checks whether an ISO timestamp or Date falls within `[start, end]` inclusive.
 */
export function isWithinRange(occurredAt: string | Date, start: Date, end: Date): boolean {
  const ms = typeof occurredAt === 'string' ? new Date(occurredAt).getTime() : occurredAt.getTime();
  if (Number.isNaN(ms)) return false;
  return ms >= start.getTime() && ms <= end.getTime();
}

/**
 * Enumerates every calendar date (`YYYY-MM-DD`) in Asia/Jakarta between `start` and `end`.
 */
export function listJakartaDatesInRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  let cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime() && dates.length <= 400) {
    dates.push(formatJakartaDateKey(cursor));
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return dates;
}
