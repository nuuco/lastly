import { useEffect, useState } from "react";
import type {
  MonthWeekOrdinal,
  ReminderSchedule,
  Weekday,
} from "../lib/types";
import {
  INTERVAL_CHIPS,
  NTH_LABELS,
  WEEKDAY_LABELS,
  normalizeSchedule,
  schedulesEqual,
} from "../recognition/intervals";

type Props = {
  value: ReminderSchedule | null;
  onChange: (next: ReminderSchedule | null) => void;
};

type CustomMode = "interval" | "weekly" | "monthlyDay" | "monthlyNth";
type IntervalUnit = "day" | "week" | "month" | "year";

const UNIT_LABEL: Record<IntervalUnit, string> = {
  day: "일",
  week: "주",
  month: "개월",
  year: "년",
};

function detectCustomMode(value: ReminderSchedule | null): CustomMode {
  const s = normalizeSchedule(value);
  if (!s) return "interval";
  if (s.kind === "weekly") return "weekly";
  if (s.kind === "monthlyDay") return "monthlyDay";
  if (s.kind === "monthlyNthWeekday") return "monthlyNth";
  return "interval";
}

function detectUnit(value: ReminderSchedule | null): IntervalUnit {
  const s = normalizeSchedule(value);
  if (!s) return "day";
  if (s.kind === "everyWeeks") return "week";
  if (s.kind === "everyMonths") return "month";
  if (s.kind === "everyYears") return "year";
  return "day";
}

function detectAmount(value: ReminderSchedule | null): string {
  const s = normalizeSchedule(value);
  if (!s) return "";
  if (s.kind === "everyDays") return String(s.days);
  if (s.kind === "everyWeeks") return String(s.weeks);
  if (s.kind === "everyMonths") return String(s.months);
  if (s.kind === "everyYears") return String(s.years);
  return "";
}

function scheduleFromUnit(amount: number, unit: IntervalUnit): ReminderSchedule {
  if (unit === "week") return { kind: "everyWeeks", weeks: amount };
  if (unit === "month") return { kind: "everyMonths", months: amount };
  if (unit === "year") return { kind: "everyYears", years: amount };
  return { kind: "everyDays", days: amount };
}

function maxForUnit(unit: IntervalUnit): number {
  if (unit === "year") return 20;
  if (unit === "month") return 36;
  if (unit === "week") return 52;
  return 365;
}

function isPreset(value: ReminderSchedule | null): boolean {
  return INTERVAL_CHIPS.some((c) => schedulesEqual(c.schedule, value));
}

export default function IntervalChips({ value, onChange }: Props) {
  const normalized = normalizeSchedule(value);
  const preset = isPreset(normalized);
  const [customOpen, setCustomOpen] = useState(!preset && normalized != null);
  const [mode, setMode] = useState<CustomMode>(detectCustomMode(normalized));
  const [unit, setUnit] = useState<IntervalUnit>(detectUnit(normalized));
  const [amount, setAmount] = useState(detectAmount(normalized));
  const [monthDay, setMonthDay] = useState(
    normalized?.kind === "monthlyDay" ? String(normalized.day) : "10",
  );
  const [nth, setNth] = useState<MonthWeekOrdinal>(
    normalized?.kind === "monthlyNthWeekday" ? normalized.nth : 2,
  );

  useEffect(() => {
    const s = normalizeSchedule(value);
    const nextPreset = isPreset(s);
    setCustomOpen(!nextPreset && s != null);
    setMode(detectCustomMode(s));
    setUnit(detectUnit(s));
    setAmount(detectAmount(s));
    if (s?.kind === "monthlyDay") setMonthDay(String(s.day));
    if (s?.kind === "monthlyNthWeekday") setNth(s.nth);
  }, [value]);

  const openCustom = () => {
    setCustomOpen(true);
    setMode(detectCustomMode(normalized));
    setUnit(detectUnit(normalized));
    setAmount(detectAmount(normalized) || "3");
  };

  const applyInterval = (raw: string, nextUnit: IntervalUnit) => {
    setAmount(raw);
    setUnit(nextUnit);
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= maxForUnit(nextUnit)) {
      onChange(scheduleFromUnit(n, nextUnit));
    }
  };

  const currentWeekday = (): Weekday => {
    if (normalized?.kind === "weekly") return normalized.weekday;
    if (normalized?.kind === "monthlyNthWeekday") return normalized.weekday;
    return 0;
  };

  return (
    <div className="interval-block">
      <label>알림 주기</label>
      <div className="interval-chips">
        {INTERVAL_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className={`interval-chip${schedulesEqual(normalized, chip.schedule) && !customOpen ? " on" : ""}`}
            onClick={() => {
              setCustomOpen(false);
              setAmount("");
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
          직접
        </button>
      </div>

      {customOpen ? (
        <div className="interval-custom-panel">
          <div className="interval-mode">
            {(
              [
                ["interval", "간격"],
                ["weekly", "매주"],
                ["monthlyDay", "매월 날짜"],
                ["monthlyNth", "매월 요일"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`interval-mode-btn${mode === id ? " on" : ""}`}
                onClick={() => {
                  setMode(id);
                  if (id === "interval") {
                    const n = Number(amount) || 1;
                    onChange(scheduleFromUnit(n, unit));
                  } else if (id === "weekly") {
                    onChange({ kind: "weekly", weekday: currentWeekday() || 5 });
                  } else if (id === "monthlyDay") {
                    const d = Number(monthDay) || 10;
                    onChange({
                      kind: "monthlyDay",
                      day: Math.min(31, Math.max(1, d)),
                    });
                  } else {
                    onChange({
                      kind: "monthlyNthWeekday",
                      nth,
                      weekday: currentWeekday() || 0,
                    });
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "interval" ? (
            <>
              <div className="interval-custom">
                <input
                  type="number"
                  min={1}
                  max={maxForUnit(unit)}
                  inputMode="numeric"
                  placeholder="숫자"
                  value={amount}
                  onChange={(event) => applyInterval(event.target.value, unit)}
                />
                <div className="unit-chips">
                  {(["day", "week", "month", "year"] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      className={`interval-chip compact${unit === u ? " on" : ""}`}
                      onClick={() => {
                        const n = Number(amount) || 1;
                        const clamped = Math.min(n, maxForUnit(u));
                        setAmount(String(clamped));
                        setUnit(u);
                        onChange(scheduleFromUnit(clamped, u));
                      }}
                    >
                      {UNIT_LABEL[u]}
                    </button>
                  ))}
                </div>
                <span>마다</span>
              </div>
              <p className="interval-hint">예: 3일 · 2주 · 1개월 · 1년마다</p>
            </>
          ) : null}

          {mode === "weekly" ? (
            <>
              <div className="weekday-chips">
                {WEEKDAY_LABELS.map((label, index) => {
                  const weekday = index as Weekday;
                  const selected =
                    normalized?.kind === "weekly" &&
                    normalized.weekday === weekday;
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`interval-chip${selected ? " on" : ""}`}
                      onClick={() => onChange({ kind: "weekly", weekday })}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="interval-hint">예: 매주 금요일</p>
            </>
          ) : null}

          {mode === "monthlyDay" ? (
            <>
              <div className="interval-custom">
                <span>매월</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  inputMode="numeric"
                  value={monthDay}
                  onChange={(event) => {
                    const next = event.target.value;
                    setMonthDay(next);
                    const d = Number(next);
                    if (Number.isInteger(d) && d >= 1 && d <= 31) {
                      onChange({ kind: "monthlyDay", day: d });
                    }
                  }}
                />
                <span>일</span>
              </div>
              <p className="interval-hint">예: 매월 10일</p>
            </>
          ) : null}

          {mode === "monthlyNth" ? (
            <>
              <div className="weekday-chips">
                {NTH_LABELS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`interval-chip${nth === item.nth ? " on" : ""}`}
                    onClick={() => {
                      setNth(item.nth);
                      onChange({
                        kind: "monthlyNthWeekday",
                        nth: item.nth,
                        weekday: currentWeekday() || 0,
                      });
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="weekday-chips stacked">
                {WEEKDAY_LABELS.map((label, index) => {
                  const weekday = index as Weekday;
                  const selected =
                    normalized?.kind === "monthlyNthWeekday" &&
                    normalized.weekday === weekday;
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`interval-chip${selected ? " on" : ""}`}
                      onClick={() =>
                        onChange({
                          kind: "monthlyNthWeekday",
                          nth,
                          weekday,
                        })
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="interval-hint">예: 매월 둘째 일요일 · 마지막 수요일</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
