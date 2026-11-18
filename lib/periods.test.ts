import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePeriod,
  fromJakartaCalendar,
  formatJakartaDateKey,
  getDaysInMonth,
  isLeapYear,
  type PeriodPreset,
} from './periods';

test('Leap year and month length rules (28/29/30/31 days)', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2025), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(1900), false);

  assert.equal(getDaysInMonth(2024, 2), 29);
  assert.equal(getDaysInMonth(2025, 2), 28);
  assert.equal(getDaysInMonth(2026, 4), 30);
  assert.equal(getDaysInMonth(2026, 11), 30);
  assert.equal(getDaysInMonth(2026, 12), 31);
});

test('All 15 presets resolve valid windows and comparison ranges in Asia/Jakarta', () => {
  // Reference: Wednesday, 18 November 2026 14:30 WIB
  const ref = fromJakartaCalendar(2026, 11, 18, 14, 30, 0);

  const presets: PeriodPreset[] = [
    'today',
    'yesterday',
    'last_7_days',
    'this_week',
    'last_week',
    'last_14_days',
    'first_half_month',
    'second_half_month',
    'this_month',
    'last_month',
    'last_3_months',
    'last_6_months',
    'this_year',
    'last_year',
    'custom',
  ];

  for (const preset of presets) {
    const win = resolvePeriod(preset, ref, {
      startDateStr: '2026-11-01',
      endDateStr: '2026-11-10',
    });
    assert.ok(win.start.getTime() <= win.end.getTime(), `${preset} start <= end`);
    assert.ok(win.previousStart.getTime() <= win.previousEnd.getTime(), `${preset} prevStart <= prevEnd`);
    assert.ok(win.previousEnd.getTime() < win.start.getTime(), `${preset} prevEnd < start`);
    assert.ok(win.totalDays >= 1, `${preset} totalDays >= 1`);
  }
});

test('Week starts on Monday (Senin–Minggu) in Asia/Jakarta', () => {
  // Sunday, 22 November 2026 23:00 WIB -> still belongs to week of Monday 16 Nov - Sunday 22 Nov 2026
  const refSunday = fromJakartaCalendar(2026, 11, 22, 23, 0, 0);
  const thisWeek = resolvePeriod('this_week', refSunday);
  assert.equal(formatJakartaDateKey(thisWeek.start), '2026-11-16');
  assert.equal(formatJakartaDateKey(thisWeek.end), '2026-11-22');
  assert.equal(formatJakartaDateKey(thisWeek.previousStart), '2026-11-09');
  assert.equal(formatJakartaDateKey(thisWeek.previousEnd), '2026-11-15');
  assert.equal(thisWeek.totalDays, 7);
});

test('Leap year February edge cases for this_month, last_month, and second_half_month', () => {
  // Reference in March 2024 (leap year) -> last_month is Feb 2024 (29 days)
  const refMarch2024 = fromJakartaCalendar(2024, 3, 10, 9, 0, 0);
  const lastMonth2024 = resolvePeriod('last_month', refMarch2024);
  assert.equal(formatJakartaDateKey(lastMonth2024.start), '2024-02-01');
  assert.equal(formatJakartaDateKey(lastMonth2024.end), '2024-02-29');
  assert.equal(lastMonth2024.totalDays, 29);
  assert.equal(formatJakartaDateKey(lastMonth2024.previousStart), '2024-01-01');
  assert.equal(formatJakartaDateKey(lastMonth2024.previousEnd), '2024-01-31');

  // Second half of Feb 2024 (15 Feb - 29 Feb = 15 days) vs prev Jan 2024 (15 Jan - 31 Jan = 17 days)
  const refFeb2024 = fromJakartaCalendar(2024, 2, 20, 12, 0, 0);
  const secondHalfFeb = resolvePeriod('second_half_month', refFeb2024);
  assert.equal(formatJakartaDateKey(secondHalfFeb.start), '2024-02-15');
  assert.equal(formatJakartaDateKey(secondHalfFeb.end), '2024-02-29');
  assert.equal(secondHalfFeb.totalDays, 15);
  assert.equal(formatJakartaDateKey(secondHalfFeb.previousStart), '2024-01-15');
  assert.equal(formatJakartaDateKey(secondHalfFeb.previousEnd), '2024-01-31');
});

test('Year boundary transition (January 2026 -> previous month December 2025)', () => {
  const refJan2026 = fromJakartaCalendar(2026, 1, 5, 8, 0, 0);
  const thisMonth = resolvePeriod('this_month', refJan2026);
  assert.equal(formatJakartaDateKey(thisMonth.start), '2026-01-01');
  assert.equal(formatJakartaDateKey(thisMonth.end), '2026-01-31');
  assert.equal(formatJakartaDateKey(thisMonth.previousStart), '2025-12-01');
  assert.equal(formatJakartaDateKey(thisMonth.previousEnd), '2025-12-31');

  const last3Months = resolvePeriod('last_3_months', refJan2026);
  assert.equal(formatJakartaDateKey(last3Months.start), '2025-11-01');
  assert.equal(formatJakartaDateKey(last3Months.end), '2026-01-31');
  assert.equal(formatJakartaDateKey(last3Months.previousStart), '2025-08-01');
  assert.equal(formatJakartaDateKey(last3Months.previousEnd), '2025-10-31');
});
