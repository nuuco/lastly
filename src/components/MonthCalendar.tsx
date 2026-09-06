import { useMemo, useState } from "react";
import { dueDatesInRange, todayKst } from "../lib/kst";
import type { RecordRow } from "../lib/types";

export type DayPick = {
  iso: string;
  performed: RecordRow[];
  due: RecordRow[];
};

type Props = {
  rows: RecordRow[];
  onSelectDay: (pick: DayPick) => void;
};

function parseIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function startWeekday(y: number, m: number) {
  return new Date(`${toIso(y, m, 1)}T12:00:00+09:00`).getDay();
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function markCluster(count: number, kind: "done" | "due") {
  if (count <= 0) return null;
  if (count === 1) {
    return <i className={`mark mark-${kind}`} />;
  }
  if (count === 2) {
    return (
      <>
        <i className={`mark mark-${kind}`} />
        <i className={`mark mark-${kind}`} />
      </>
    );
  }
  return <span className={`mark-count mark-count-${kind}`}>{count}</span>;
}

export default function MonthCalendar({ rows, onSelectDay }: Props) {
  const today = todayKst();
  const base = parseIso(today);
  const [cursor, setCursor] = useState({ y: base.y, m: base.m });

  const { performedBy, dueBy } = useMemo(() => {
    const performedBy = new Map<string, RecordRow[]>();
    const dueBy = new Map<string, RecordRow[]>();
    const from = toIso(cursor.y, cursor.m, 1);
    const to = toIso(cursor.y, cursor.m, daysInMonth(cursor.y, cursor.m));
    for (const row of rows) {
      const performed = performedBy.get(row.lastPerformedOn) ?? [];
      performed.push(row);
      performedBy.set(row.lastPerformedOn, performed);

      for (const due of dueDatesInRange(
        row.lastPerformedOn,
        row.schedule,
        from,
        to,
      )) {
        const list = dueBy.get(due) ?? [];
        list.push(row);
        dueBy.set(due, list);
      }
    }
    return { performedBy, dueBy };
  }, [rows, cursor]);

  const cells = useMemo(() => {
    const total = daysInMonth(cursor.y, cursor.m);
    const pad = startWeekday(cursor.y, cursor.m);
    const list: Array<{ iso: string; day: number } | null> = [];
    for (let i = 0; i < pad; i += 1) list.push(null);
    for (let day = 1; day <= total; day += 1) {
      list.push({ iso: toIso(cursor.y, cursor.m, day), day });
    }
    while (list.length < 42) list.push(null);
    return list;
  }, [cursor]);

  const shiftMonth = (delta: number) => {
    let { y, m } = cursor;
    m += delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setCursor({ y, m });
  };

  return (
    <div className="month-cal">
      <div className="cal-head">
        <button
          type="button"
          className="cal-nav"
          aria-label="이전 달"
          onClick={() => shiftMonth(-1)}
        >
          ‹
        </button>
        <div className="cal-title">
          {cursor.y}년 {cursor.m}월
        </div>
        <button
          type="button"
          className="cal-nav"
          aria-label="다음 달"
          onClick={() => shiftMonth(1)}
        >
          ›
        </button>
      </div>
      <div className="cal-week">
        {WEEK.map((w) => (
          <span key={w} className={w === "일" ? "sun" : undefined}>
            {w}
          </span>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((cell, index) => {
          if (!cell) return <span key={`e-${index}`} className="cal-empty" />;
          const performed = performedBy.get(cell.iso) ?? [];
          const due = dueBy.get(cell.iso) ?? [];
          const isToday = cell.iso === today;
          return (
            <button
              key={cell.iso}
              type="button"
              className={[
                "cal-day",
                "month-day",
                isToday ? "today" : "",
                performed.length ? "has-done" : "",
                due.length ? "has-due" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() =>
                onSelectDay({ iso: cell.iso, performed, due })
              }
            >
              <span>{cell.day}</span>
              <span className="month-marks" aria-hidden>
                {markCluster(performed.length, "done")}
                {markCluster(due.length, "due")}
              </span>
            </button>
          );
        })}
      </div>
      <div className="cal-legend">
        <span>
          <i className="mark mark-done" /> 수행
        </span>
        <span>
          <i className="mark mark-due" /> 알림 예정
        </span>
        <span className="cal-legend-note">3건 이상은 숫자</span>
      </div>
    </div>
  );
}
