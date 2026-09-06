import type {
  MonthWeekOrdinal,
  NormalizedReminderSchedule,
  ReminderSchedule,
  Weekday,
} from "../lib/types";

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const NTH_LABELS: Array<{ nth: MonthWeekOrdinal; label: string }> = [
  { nth: 1, label: "첫째" },
  { nth: 2, label: "둘째" },
  { nth: 3, label: "셋째" },
  { nth: 4, label: "넷째" },
  { nth: -1, label: "마지막" },
];

const WEEKDAY_FROM_KO: Record<string, Weekday> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};

const NTH_FROM_KO: Record<string, MonthWeekOrdinal> = {
  첫: 1,
  첫째: 1,
  두: 2,
  둘째: 2,
  세: 3,
  셋째: 3,
  네: 4,
  넷째: 4,
  마지막: -1,
};

export function weekdayFromIso(iso: string): Weekday {
  return new Date(`${iso}T12:00:00+09:00`).getDay() as Weekday;
}

export function dayFromIso(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** 빠른 선택 프리셋 (맞춤은 IntervalChips에서 별도) */
export function intervalPresets(): Array<{
  id: string;
  label: string;
  schedule: ReminderSchedule | null;
}> {
  return [
    { id: "none", label: "없음", schedule: null },
    { id: "d7", label: "7일", schedule: { kind: "everyDays", days: 7 } },
    { id: "d14", label: "14일", schedule: { kind: "everyDays", days: 14 } },
    { id: "d30", label: "30일", schedule: { kind: "everyDays", days: 30 } },
  ];
}

/** IndexedDB 구버전 숫자 주기 → schedule. 쓰기에는 쓰지 않음 */
export function scheduleFromIntervalDays(
  days: number | null | undefined,
): ReminderSchedule | null {
  if (days == null || !Number.isInteger(days) || days < 1) return null;
  return { kind: "everyDays", days };
}

/** 구형 monthlyLast 등을 현재 스키마로 */
export function normalizeSchedule(
  schedule: ReminderSchedule | null | undefined,
): NormalizedReminderSchedule | null {
  if (!schedule) return null;
  if (schedule.kind === "monthlyLast") {
    return {
      kind: "monthlyNthWeekday",
      nth: -1,
      weekday: schedule.weekday,
    };
  }
  return schedule;
}

export function schedulesEqual(
  a: ReminderSchedule | null | undefined,
  b: ReminderSchedule | null | undefined,
): boolean {
  const left = normalizeSchedule(a);
  const right = normalizeSchedule(b);
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  if (left.kind !== right.kind) return false;
  if (left.kind === "everyDays" && right.kind === "everyDays") {
    return left.days === right.days;
  }
  if (left.kind === "everyWeeks" && right.kind === "everyWeeks") {
    return left.weeks === right.weeks;
  }
  if (left.kind === "everyMonths" && right.kind === "everyMonths") {
    return left.months === right.months;
  }
  if (left.kind === "everyYears" && right.kind === "everyYears") {
    return left.years === right.years;
  }
  if (left.kind === "weekly" && right.kind === "weekly") {
    return left.weekday === right.weekday;
  }
  if (left.kind === "monthlyDay" && right.kind === "monthlyDay") {
    return left.day === right.day;
  }
  if (left.kind === "monthlyNthWeekday" && right.kind === "monthlyNthWeekday") {
    return left.nth === right.nth && left.weekday === right.weekday;
  }
  return false;
}

export function isIntervalPreset(
  schedule: ReminderSchedule | null | undefined,
): boolean {
  return intervalPresets().some((c) => schedulesEqual(c.schedule, schedule));
}

export function formatScheduleLabel(
  schedule: ReminderSchedule | null | undefined,
): string {
  const s = normalizeSchedule(schedule);
  if (!s) return "알림 없음";
  if (s.kind === "everyDays") {
    if (s.days === 1) return "매일";
    return `${s.days}일마다`;
  }
  if (s.kind === "everyWeeks") {
    if (s.weeks === 1) return "매주";
    return `${s.weeks}주마다`;
  }
  if (s.kind === "everyMonths") {
    if (s.months === 1) return "매월";
    return `${s.months}개월마다`;
  }
  if (s.kind === "everyYears") {
    if (s.years === 1) return "매년";
    return `${s.years}년마다`;
  }
  if (s.kind === "weekly") {
    return `매주 ${WEEKDAY_LABELS[s.weekday]}요일`;
  }
  if (s.kind === "monthlyDay") {
    return `매월 ${s.day}일`;
  }
  const nthLabel =
    NTH_LABELS.find((n) => n.nth === s.nth)?.label ?? `${s.nth}째`;
  return `매월 ${nthLabel} ${WEEKDAY_LABELS[s.weekday]}요일`;
}

/** “N일/주/개월/년마다 · 매주 금 · 매월 10일 · 매월 둘째 일요일 …” */
export function extractSchedule(
  text: string,
): { schedule: ReminderSchedule; matched: string } | null {
  const monthlyNth = text.match(
    /매월\s*(첫째|둘째|셋째|넷째|마지막|첫|두|세|네)\s*(?:주\s*)?([월화수목금토일])\s*요일/u,
  );
  if (monthlyNth) {
    const nth = NTH_FROM_KO[monthlyNth[1]];
    const weekday = WEEKDAY_FROM_KO[monthlyNth[2]];
    if (nth !== undefined && weekday !== undefined) {
      return {
        schedule: { kind: "monthlyNthWeekday", nth, weekday },
        matched: monthlyNth[0],
      };
    }
  }

  const monthlyDay = text.match(/매월\s*(\d{1,2})\s*일(?:\s*마다)?/u);
  if (monthlyDay) {
    const day = Number(monthlyDay[1]);
    if (day >= 1 && day <= 31) {
      return {
        schedule: { kind: "monthlyDay", day },
        matched: monthlyDay[0],
      };
    }
  }

  const weekly = text.match(/매주\s*([월화수목금토일])\s*요일/u);
  if (weekly) {
    const weekday = WEEKDAY_FROM_KO[weekly[1]];
    if (weekday !== undefined) {
      return {
        schedule: { kind: "weekly", weekday },
        matched: weekly[0],
      };
    }
  }

  const everyYearsNamed = text.match(/매년|해마다/u);
  if (everyYearsNamed) {
    return {
      schedule: { kind: "everyYears", years: 1 },
      matched: everyYearsNamed[0],
    };
  }

  const everyMonthsNamed = text.match(/한\s*달마다|달마다|매월(?!\s*\d)/u);
  if (everyMonthsNamed) {
    return {
      schedule: { kind: "everyMonths", months: 1 },
      matched: everyMonthsNamed[0],
    };
  }

  const named: Array<[RegExp, number]> = [
    [/보름마다/u, 15],
    [/일주일마다|한\s*주마다|한주마다|(?<!\d)주마다/u, 7],
    [/사흘마다/u, 3],
    [/이틀마다/u, 2],
    [/매일|하루마다/u, 1],
  ];
  for (const [pattern, days] of named) {
    const hit = text.match(pattern);
    if (hit) {
      return { schedule: { kind: "everyDays", days }, matched: hit[0] };
    }
  }

  const everyWeek = text.match(/매주(?!\s*[월화수목금토일])/u);
  if (everyWeek) {
    return {
      schedule: { kind: "everyWeeks", weeks: 1 },
      matched: everyWeek[0],
    };
  }

  const biweekly = text.match(/이\s*주마다|이주마다|이주\s*에\s*한\s*번/u);
  if (biweekly) {
    return {
      schedule: { kind: "everyWeeks", weeks: 2 },
      matched: biweekly[0],
    };
  }

  const years =
    text.match(/(\d+)\s*년\s*마다/u) ?? text.match(/(\d+)\s*년에\s*한\s*번/u);
  if (years) {
    const n = Number(years[1]);
    if (n >= 1 && n <= 20) {
      return {
        schedule: { kind: "everyYears", years: n },
        matched: years[0],
      };
    }
  }

  const months =
    text.match(/(\d+)\s*개?월\s*마다/u) ??
    text.match(/(\d+)\s*달\s*마다/u) ??
    text.match(/(\d+)\s*개월에\s*한\s*번/u);
  if (months) {
    const n = Number(months[1]);
    if (n >= 1 && n <= 36) {
      return {
        schedule: { kind: "everyMonths", months: n },
        matched: months[0],
      };
    }
  }

  const weeks =
    text.match(/(\d+)\s*주\s*마다/u) ?? text.match(/(\d+)\s*주에\s*한\s*번/u);
  if (weeks) {
    const n = Number(weeks[1]);
    if (n >= 1 && n <= 52) {
      return {
        schedule: { kind: "everyWeeks", weeks: n },
        matched: weeks[0],
      };
    }
  }

  const numeric =
    text.match(/(\d+)\s*일\s*마다/u) ??
    text.match(/(\d+)\s*일에\s*한\s*번/u) ??
    text.match(/(\d+)\s*일\s*간격/u);
  if (numeric) {
    const days = Number(numeric[1]);
    if (days >= 1 && days <= 365) {
      return {
        schedule: { kind: "everyDays", days },
        matched: numeric[0],
      };
    }
  }
  return null;
}

export function stripIntervalPhrase(text: string): string {
  const hit = extractSchedule(text);
  if (!hit) return text;
  return text
    .replace(hit.matched, " ")
    .replace(/알려\s*줘|알려\s*주세요|알림|리마인드/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
