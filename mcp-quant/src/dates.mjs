// Calendar dates without time zones: ISO "YYYY-MM-DD" strings, serial day numbers and the bond
// day-count conventions. No business-day calendars; dates are taken as given (unadjusted).
import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

export function parseDate(s, label = "date") {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) throw new Error(`${label} ${s} is not a YYYY-MM-DD date.`);
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) throw new Error(`${label} ${s} is not a real calendar date.`);
  return { y, m: mo, d, serial: t / 86400000 };
}

const fromSerial = (serial) => {
  const dt = new Date(serial * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), serial };
};

export const formatDate = (x) => `${String(x.y).padStart(4, "0")}-${String(x.m).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`;
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// Adds months, clamping the day to the month's end (31 Aug - 6 months = 28/29 Feb).
export function addMonths(x, months) {
  const total = x.y * 12 + (x.m - 1) + months;
  const y = Math.floor(total / 12), m = (total % 12) + 1;
  const d = Math.min(x.d, daysInMonth(y, m));
  return fromSerial(Date.UTC(y, m - 1, d) / 86400000);
}

export const DAY_COUNTS = ["30/360", "ACT/360", "ACT/365F", "ACT/ACT"];
export const dayCountArg = z.enum(DAY_COUNTS).optional().describe("Day count: 30/360 (bond basis, default), ACT/360, ACT/365F, or ACT/ACT (ICMA, by coupon period).");

// Year fraction between a and b. ACT/ACT is the ICMA rule and needs the coupon period [refStart, refEnd]
// that contains the interval and the coupon frequency.
export function yearFraction(dc, a, b, refStart, refEnd, freq) {
  if (dc === "ACT/360") return (b.serial - a.serial) / 360;
  if (dc === "ACT/365F") return (b.serial - a.serial) / 365;
  if (dc === "ACT/ACT") return (b.serial - a.serial) / (refEnd.serial - refStart.serial) / freq;
  // 30/360 bond basis: a day-31 start becomes 30; a day-31 end becomes 30 when the start is 30 or 31.
  let d1 = a.d, d2 = b.d;
  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 >= 30) d2 = 30;
  return (360 * (b.y - a.y) + 30 * (b.m - a.m) + (d2 - d1)) / 360;
}

// Actual/actual (ISDA) split by calendar year, for continuous-time measures that need it.
export function actActIsda(a, b) {
  let t = 0, cur = a;
  while (cur.y < b.y) {
    const next = parseDate(`${cur.y + 1}-01-01`);
    t += (next.serial - cur.serial) / (isLeap(cur.y) ? 366 : 365);
    cur = next;
  }
  return t + (b.serial - cur.serial) / (isLeap(cur.y) ? 366 : 365);
}

// Regular coupon dates generated backward from maturity (maturity - k * 12/freq months), from the
// last coupon on or before settlement through maturity.
export function couponSchedule(settle, maturity, freq) {
  if (!(maturity.serial > settle.serial)) throw new Error("maturity must be after settlement.");
  if (![1, 2, 4, 12].includes(freq)) throw new Error("frequency must be 1, 2, 4 or 12.");
  const step = 12 / freq, dates = [maturity];
  for (let k = 1; ; k++) {
    const d = addMonths(maturity, -k * step);
    dates.unshift(d);
    if (d.serial <= settle.serial) break;
    if (k > 12 * 200) throw new Error("schedule longer than 200 years.");
  }
  return dates;
}
