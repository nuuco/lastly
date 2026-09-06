import { useEffect, useRef, useState } from "react";
import { nextDueOn, todayKst } from "../lib/kst";
import type {
  MonthWeekOrdinal,
  ReminderSchedule,
  Weekday,
} from "../lib/types";
import {
  NTH_LABELS,
  WEEKDAY_LABELS,
  dayFromIso,
  formatScheduleLabel,
  intervalPresets,
  isIntervalPreset,
  normalizeSchedule,
  schedulesEqual,
  weekdayFromIso,
} from "../recognition/intervals";

type Props = {
  value: ReminderSchedule | null;
  onChange: (next: ReminderSchedule | null) => void;
  /** 수행일 — 매주/매월 프리셋·맞춤 기본값 */
  anchorDate?: string;
};

type IntervalUnit = "day" | "week" | "month" | "year";
type MonthAnchor = "date" | "nth";

const UNIT_LABEL: Record<IntervalUnit, string> = {
  day: "일",
  week: "주",
  month: "개월",
  year: "년",
};

function maxForUnit(unit: IntervalUnit): number {
  if (unit === "year") return 20;
  if (unit === "month") return 36;
  if (unit === "week") return 52;
  return 365;
}

function detectUnit(value: ReminderSchedule | null): IntervalUnit {
  const s = normalizeSchedule(value);
  if (!s) return "week";
  if (s.kind === "everyDays") return "day";
  if (s.kind === "everyWeeks" || s.kind === "weekly") return "week";
  if (
    s.kind === "everyMonths" ||
    s.kind === "monthlyDay" ||
    s.kind === "monthlyNthWeekday"
  ) {
    return "month";
  }
  if (s.kind === "everyYears") return "year";
  return "week";
}

function detectAmount(value: ReminderSchedule | null): string {
  const s = normalizeSchedule(value);
  if (!s) return "1";
  if (s.kind === "everyDays") return String(s.days);
  if (s.kind === "everyWeeks") return String(s.weeks);
  if (s.kind === "everyMonths") return String(s.months);
  if (s.kind === "everyYears") return String(s.years);
  return "1";
}

function detectWeekday(
  value: ReminderSchedule | null,
  anchorIso: string,
): Weekday {
  const s = normalizeSchedule(value);
  if (s?.kind === "weekly") return s.weekday;
  if (s?.kind === "monthlyNthWeekday") return s.weekday;
  return weekdayFromIso(anchorIso);
}

function detectMonthDay(
  value: ReminderSchedule | null,
  anchorIso: string,
): string {
  const s = normalizeSchedule(value);
  if (s?.kind === "monthlyDay") return String(s.day);
  return String(dayFromIso(anchorIso) || 1);
}

function detectNth(value: ReminderSchedule | null): MonthWeekOrdinal {
  const s = normalizeSchedule(value);
  if (s?.kind === "monthlyNthWeekday") return s.nth;
  return 2;
}

function detectMonthAnchor(value: ReminderSchedule | null): MonthAnchor {
  const s = normalizeSchedule(value);
  if (s?.kind === "monthlyNthWeekday") return "nth";
  return "date";
}

function buildCustomSchedule(opts: {
  amount: number;
  unit: IntervalUnit;
  weekday: Weekday;
  monthDay: number;
  nth: MonthWeekOrdinal;
  monthAnchor: MonthAnchor;
}): ReminderSchedule {
  const { amount, unit, weekday, monthDay, nth, monthAnchor } = opts;
  if (unit === "day") return { kind: "everyDays", days: amount };
  if (unit === "year") return { kind: "everyYears", years: amount };
  if (unit === "week") {
    if (amount === 1) return { kind: "weekly", weekday };
    return { kind: "everyWeeks", weeks: amount };
  }
  // month
  if (amount === 1 && monthAnchor === "date") {
    return { kind: "monthlyDay", day: monthDay };
  }
  if (amount === 1 && monthAnchor === "nth") {
    return { kind: "monthlyNthWeekday", nth, weekday };
  }
  return { kind: "everyMonths", months: amount };
}

/** 2026-09-20 → 9월 20일 */
function formatDueShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

export default function IntervalChips({
  value,
  onChange,
  anchorDate,
}: Props) {
  const anchor = anchorDate || todayKst();
  const normalized = normalizeSchedule(value);
  const presets = intervalPresets();
  const preset = isIntervalPreset(normalized);
  /** 맞춤을 연 뒤에는 값이 프리셋과 같아도 패널을 유지 */
  const customIntentRef = useRef(false);
  const [customOpen, setCustomOpen] = useState(!preset && normalized != null);

  const [unit, setUnit] = useState<IntervalUnit>(detectUnit(normalized));
  const [amount, setAmount] = useState(detectAmount(normalized));
  const [weekday, setWeekday] = useState(detectWeekday(normalized, anchor));
  const [monthDay, setMonthDay] = useState(detectMonthDay(normalized, anchor));
  const [nth, setNth] = useState<MonthWeekOrdinal>(detectNth(normalized));
  const [monthAnchor, setMonthAnchor] = useState<MonthAnchor>(
    detectMonthAnchor(normalized),
  );

  useEffect(() => {
    const s = normalizeSchedule(value);
    const nextPreset = isIntervalPreset(s);
    if (customIntentRef.current) {
      setCustomOpen(true);
    } else {
      setCustomOpen(!nextPreset && s != null);
    }
    setUnit(detectUnit(s));
    setAmount(detectAmount(s));
    setWeekday(detectWeekday(s, anchor));
    setMonthDay(detectMonthDay(s, anchor));
    setNth(detectNth(s));
    setMonthAnchor(detectMonthAnchor(s));
  }, [value, anchor]);

  const emitCustom = (patch: {
    amount?: string;
    unit?: IntervalUnit;
    weekday?: Weekday;
    monthDay?: string;
    nth?: MonthWeekOrdinal;
    monthAnchor?: MonthAnchor;
  }) => {
    customIntentRef.current = true;
    const nextUnit = patch.unit ?? unit;
    const nextAmountRaw = patch.amount ?? amount;
    const nextWeekday = patch.weekday ?? weekday;
    const nextMonthDayRaw = patch.monthDay ?? monthDay;
    const nextNth = patch.nth ?? nth;
    const nextMonthAnchor = patch.monthAnchor ?? monthAnchor;

    if (patch.unit !== undefined) setUnit(patch.unit);
    if (patch.amount !== undefined) setAmount(patch.amount);
    if (patch.weekday !== undefined) setWeekday(patch.weekday);
    if (patch.monthDay !== undefined) setMonthDay(patch.monthDay);
    if (patch.nth !== undefined) setNth(patch.nth);
    if (patch.monthAnchor !== undefined) setMonthAnchor(patch.monthAnchor);

    const n = Number(nextAmountRaw);
    const day = Number(nextMonthDayRaw);
    if (!Number.isInteger(n) || n < 1 || n > maxForUnit(nextUnit)) return;
    if (
      nextUnit === "month" &&
      nextMonthAnchor === "date" &&
      n === 1 &&
      (!Number.isInteger(day) || day < 1 || day > 31)
    ) {
      return;
    }

    onChange(
      buildCustomSchedule({
        amount: n,
        unit: nextUnit,
        weekday: nextWeekday,
        monthDay: Math.min(31, Math.max(1, day || 1)),
        nth: nextNth,
        monthAnchor: nextMonthAnchor,
      }),
    );
  };

  const openCustom = () => {
    customIntentRef.current = true;
    setCustomOpen(true);
    if (!normalized) {
      setUnit("day");
      setAmount("3");
      setWeekday(weekdayFromIso(anchor));
      setMonthDay(String(dayFromIso(anchor) || 1));
      setNth(2);
      setMonthAnchor("date");
      onChange({ kind: "everyDays", days: 3 });
      return;
    }
    // 프리셋·기존 맞춤 모두 현재 값으로 패널만 연다 (intent로 유지)
    const nextUnit = detectUnit(normalized);
    const nextAmount = detectAmount(normalized);
    const nextWeekday = detectWeekday(normalized, anchor);
    const nextMonthDay = detectMonthDay(normalized, anchor);
    const nextNth = detectNth(normalized);
    const nextMonthAnchor = detectMonthAnchor(normalized);
    setUnit(nextUnit);
    setAmount(nextAmount);
    setWeekday(nextWeekday);
    setMonthDay(nextMonthDay);
    setNth(nextNth);
    setMonthAnchor(nextMonthAnchor);
  };

  const due = normalized
    ? nextDueOn(anchor, normalized)
    : null;
  const summary = normalized
    ? formatScheduleLabel(normalized)
    : null;
  const dueLabel = due ? `다음 ${formatDueShort(due)}` : null;

  const amountNum = Number(amount) || 1;
  const showWeekdays = unit === "week" && amountNum === 1;
  const showMonthDetail = unit === "month" && amountNum === 1;

  return (
    <div className="interval-block">
      <label>알림 주기</label>
      <div className="interval-chips">
        {presets.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`interval-chip${schedulesEqual(normalized, chip.schedule) && !customOpen ? " on" : ""}`}
            onClick={() => {
              customIntentRef.current = false;
              setCustomOpen(false);
              onChange(chip.schedule);
            }}
          >
            {chip.label}
          </button>
        ))}
        <button
          type="button"
          className={`interval-chip${customOpen ? " on" : ""}`}
          onClick={openCustom}
        >
          맞춤
        </button>
      </div>

      {customOpen ? (
        <div className="interval-custom-panel">
          <div className="interval-field">
            <span className="interval-field-label">간격</span>
            <div className="interval-stepper">
              <input
                type="number"
                min={1}
                max={maxForUnit(unit)}
                inputMode="numeric"
                aria-label="주기 숫자"
                value={amount}
                onChange={(event) => emitCustom({ amount: event.target.value })}
              />
              <div className="unit-chips">
                {(["day", "week", "month", "year"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={`interval-chip compact${unit === u ? " on" : ""}`}
                    onClick={() => {
                      const n = Math.min(Number(amount) || 1, maxForUnit(u));
                      emitCustom({ unit: u, amount: String(n) });
                    }}
                  >
                    {UNIT_LABEL[u]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {showWeekdays ? (
            <div className="interval-field">
              <span className="interval-field-label">요일</span>
              <div className="weekday-chips stacked">
                {WEEKDAY_LABELS.map((label, index) => {
                  const day = index as Weekday;
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`interval-chip${weekday === day ? " on" : ""}`}
                      onClick={() => emitCustom({ weekday: day })}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {showMonthDetail ? (
            <div className="interval-field">
              <span className="interval-field-label">기준</span>
              <div className="interval-mode">
                <button
                  type="button"
                  className={`interval-mode-btn${monthAnchor === "date" ? " on" : ""}`}
                  onClick={() => emitCustom({ monthAnchor: "date" })}
                >
                  같은 날짜
                </button>
                <button
                  type="button"
                  className={`interval-mode-btn${monthAnchor === "nth" ? " on" : ""}`}
                  onClick={() => emitCustom({ monthAnchor: "nth" })}
                >
                  몇째 요일
                </button>
              </div>
              {monthAnchor === "date" ? (
                <div className="interval-day-row">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    aria-label="매월 날짜"
                    value={monthDay}
                    onChange={(event) =>
                      emitCustom({ monthDay: event.target.value })
                    }
                  />
                  <span>일</span>
                </div>
              ) : (
                <>
                  <div className="nth-chips">
                    {NTH_LABELS.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className={`interval-chip${nth === item.nth ? " on" : ""}`}
                        onClick={() => emitCustom({ nth: item.nth })}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="weekday-chips stacked">
                    {WEEKDAY_LABELS.map((label, index) => {
                      const day = index as Weekday;
                      return (
                        <button
                          key={label}
                          type="button"
                          className={`interval-chip${weekday === day ? " on" : ""}`}
                          onClick={() => emitCustom({ weekday: day })}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {summary ? (
        <p className="interval-summary">
          <strong>{summary}</strong>
          {dueLabel ? <span>{dueLabel}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
