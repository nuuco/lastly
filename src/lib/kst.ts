import type { ReminderSchedule } from "./types";
import { normalizeSchedule } from "../recognition/intervals";

const KST = "Asia/Seoul";

export function todayKst(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function kstParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
  };
}

export function shiftKstDate(days: number, now = new Date()): string {
  const { year, month, day } = kstParts(now);
  const utc = Date.UTC(year, month - 1, day + days);
  return todayKst(new Date(utc));
}

const WEEKDAY_KO: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};

const WEEKDAY_EN: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function lastWeekdayKst(label: string, now = new Date()): string | null {
  const target = WEEKDAY_KO[label];
  if (target === undefined) return null;
  const { year, month, day, weekday } = kstParts(now);
  const current = WEEKDAY_EN[weekday] ?? 0;
  const delta = current === target ? 7 : (current - target + 7) % 7 || 7;
  const utc = Date.UTC(year, month - 1, day - delta);
  return todayKst(new Date(utc));
}

export function daysSince(isoDate: string, now = new Date()): number {
  const today = todayKst(now);
  const a = Date.parse(`${isoDate}T00:00:00+09:00`);
  const b = Date.parse(`${today}T00:00:00+09:00`);
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** ISO 날짜에 N일을 더한다 (KST 달력 기준). */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return todayKst(new Date(Date.UTC(y, m - 1, d + days)));
}

/** 월 단위 가산. 말일 넘침은 해당 월 말일로 보정. */
export function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1 + months, 1));
  const yy = anchor.getUTCFullYear();
  const mm = anchor.getUTCMonth() + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${yy}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addYearsIso(isoDate: string, years: number): string {
  return addMonthsIso(isoDate, years * 12);
}

function weekdayOfIso(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00+09:00`).getDay();
}

/** 수행일 다음 날부터 가장 가까운 해당 요일 */
export function nextWeekdayOnOrAfter(isoDate: string, weekday: number): string {
  const current = weekdayOfIso(isoDate);
  const delta = (weekday - current + 7) % 7;
  return addDaysIso(isoDate, delta === 0 ? 7 : delta);
}

/** 해당 연·월의 마지막 특정 요일 (KST) */
export function lastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = lastDay; day >= 1; day -= 1) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (weekdayOfIso(iso) === weekday) return iso;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/** 해당 연·월의 N번째 요일. nth=-1이면 마지막. 없으면 null */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  nth: number,
  weekday: number,
): string | null {
  if (nth === -1) return lastWeekdayOfMonth(year, month, weekday);
  const firstIso = `${year}-${String(month).padStart(2, "0")}-01`;
  const firstWd = weekdayOfIso(firstIso);
  const delta = (weekday - firstWd + 7) % 7;
  const day = 1 + delta + (nth - 1) * 7;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > lastDay) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthDayOfMonth(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = Math.min(Math.max(1, day), lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  let month = m + delta;
  let year = y;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return { y: year, m: month };
}

function nextMonthlyOccurrence(
  start: string,
  pick: (y: number, m: number) => string | null,
): string | null {
  const [y0, m0] = start.split("-").map(Number);
  for (let i = 0; i < 14; i += 1) {
    const { y, m } = shiftMonth(y0, m0, i);
    const candidate = pick(y, m);
    if (candidate && candidate >= start) return candidate;
  }
  return null;
}

export function nextDueOn(
  lastPerformedOn: string,
  schedule: ReminderSchedule | number | null | undefined,
): string | null {
  if (typeof schedule === "number") {
    if (schedule < 1) return null;
    return addDaysIso(lastPerformedOn, schedule);
  }
  const normalized = normalizeSchedule(schedule);
  if (!normalized) return null;

  if (normalized.kind === "everyDays") {
    if (normalized.days < 1) return null;
    return addDaysIso(lastPerformedOn, normalized.days);
  }

  if (normalized.kind === "everyWeeks") {
    if (normalized.weeks < 1) return null;
    return addDaysIso(lastPerformedOn, normalized.weeks * 7);
  }

  if (normalized.kind === "everyMonths") {
    if (normalized.months < 1) return null;
    return addMonthsIso(lastPerformedOn, normalized.months);
  }

  if (normalized.kind === "everyYears") {
    if (normalized.years < 1) return null;
    return addYearsIso(lastPerformedOn, normalized.years);
  }

  if (normalized.kind === "weekly") {
    return nextWeekdayOnOrAfter(
      addDaysIso(lastPerformedOn, 1),
      normalized.weekday,
    );
  }

  const start = addDaysIso(lastPerformedOn, 1);

  if (normalized.kind === "monthlyDay") {
    return nextMonthlyOccurrence(start, (y, m) =>
      monthDayOfMonth(y, m, normalized.day),
    );
  }

  if (normalized.kind === "monthlyNthWeekday") {
    return nextMonthlyOccurrence(start, (y, m) =>
      nthWeekdayOfMonth(y, m, normalized.nth, normalized.weekday),
    );
  }

  return null;
}

/** 고정 일수 주기면 간격, 아니면 null (월·년·몇째 요일은 달마다 길이가 다름) */
function fixedCycleDays(
  schedule: ReminderSchedule | number | null | undefined,
): number | null {
  if (typeof schedule === "number") return schedule >= 1 ? schedule : null;
  const normalized = normalizeSchedule(schedule);
  if (!normalized) return null;
  if (normalized.kind === "everyDays" && normalized.days >= 1) {
    return normalized.days;
  }
  if (normalized.kind === "everyWeeks" && normalized.weeks >= 1) {
    return normalized.weeks * 7;
  }
  if (normalized.kind === "weekly") return 7;
  return null;
}

/**
 * [fromIso, toIso] 안의 주기 해당일. 달력 노란 점용.
 * 마지막 수행일 다음부터, 다시 기록하기 전까지 같은 간격으로 이어진다.
 */
export function dueDatesInRange(
  lastPerformedOn: string,
  schedule: ReminderSchedule | number | null | undefined,
  fromIso: string,
  toIso: string,
): string[] {
  if (fromIso > toIso) return [];
  const first = nextDueOn(lastPerformedOn, schedule);
  if (!first || first > toIso) return [];

  const out: string[] = [];
  const step = fixedCycleDays(schedule);

  if (step != null) {
    let d = first;
    if (d < fromIso) {
      const gap = daysBetween(d, fromIso);
      d = addDaysIso(d, Math.ceil(gap / step) * step);
    }
    let guard = 0;
    while (d <= toIso && guard < 400) {
      if (d >= fromIso) out.push(d);
      d = addDaysIso(d, step);
      guard += 1;
    }
    return out;
  }

  let d: string | null = first;
  let guard = 0;
  while (d && d <= toIso && guard < 600) {
    if (d >= fromIso) out.push(d);
    const next = nextDueOn(d, schedule);
    if (!next || next <= d) break;
    d = next;
    guard += 1;
  }
  return out;
}

export function isOverdue(
  lastPerformedOn: string,
  schedule: ReminderSchedule | number | null | undefined,
  now = new Date(),
): boolean {
  const due = nextDueOn(lastPerformedOn, schedule);
  if (!due) return false;
  return todayKst(now) >= due;
}

export function formatKoreanDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${y}.${m}.${d}`;
}

/** from → to 일수 (음수 가능) */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00+09:00`);
  const b = Date.parse(`${toIso}T00:00:00+09:00`);
  return Math.round((b - a) / 86400000);
}

export type ScheduleProgress = {
  dueOn: string;
  cycleDays: number;
  elapsed: number;
  daysLeft: number;
  /** 0~1+ (초과 시 1 초과) */
  ratio: number;
  /** 표시용 0~100 */
  pct: number;
  status: "fresh" | "warn" | "due";
};

export function scheduleProgress(
  lastPerformedOn: string,
  schedule: ReminderSchedule | number | null | undefined,
  now = new Date(),
): ScheduleProgress | null {
  const dueOn = nextDueOn(lastPerformedOn, schedule);
  if (!dueOn) return null;

  let cycleDays: number;
  if (typeof schedule === "number") {
    cycleDays = schedule;
  } else {
    const normalized = normalizeSchedule(schedule);
    if (normalized?.kind === "everyDays") cycleDays = normalized.days;
    else if (normalized?.kind === "everyWeeks") cycleDays = normalized.weeks * 7;
    else if (normalized?.kind === "everyMonths")
      cycleDays = normalized.months * 30;
    else if (normalized?.kind === "everyYears")
      cycleDays = normalized.years * 365;
    else cycleDays = Math.max(1, daysBetween(lastPerformedOn, dueOn));
  }

  const elapsed = daysSince(lastPerformedOn, now);
  const daysLeft = daysBetween(todayKst(now), dueOn);
  const ratio = elapsed / cycleDays;
  const status: ScheduleProgress["status"] =
    ratio >= 1 || daysLeft <= 0 ? "due" : ratio >= 0.7 ? "warn" : "fresh";

  return {
    dueOn,
    cycleDays,
    elapsed,
    daysLeft,
    ratio,
    pct: Math.min(100, Math.round(Math.min(ratio, 1) * 100)),
    status,
  };
}
