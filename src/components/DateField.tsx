import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatKoreanDate, shiftKstDate, todayKst } from "../lib/kst";
import { formatSpeakDate } from "../recognition/voice";

type Props = {
  value: string;
  onChange: (next: string) => void;
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

/** 해당 월 1일의 요일 (0=일 … 6=토), KST 날짜 문자열 기준 */
function startWeekday(y: number, m: number) {
  return new Date(`${toIso(y, m, 1)}T12:00:00+09:00`).getDay();
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export default function DateField({ value, onChange }: Props) {
  const today = todayKst();
  const yesterday = shiftKstDate(-1);
  const selected = parseIso(value || today);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState({ y: selected.y, m: selected.m });
  const hostRef = useRef<Element | null>(null);

  const cells = useMemo(() => {
    const total = daysInMonth(cursor.y, cursor.m);
    const pad = startWeekday(cursor.y, cursor.m);
    const list: Array<{ iso: string; day: number; outside: boolean } | null> =
      [];
    for (let i = 0; i < pad; i += 1) list.push(null);
    for (let day = 1; day <= total; day += 1) {
      const iso = toIso(cursor.y, cursor.m, day);
      list.push({ iso, day, outside: iso > today });
    }
    while (list.length < 42) list.push(null);
    return list;
  }, [cursor, today]);

  const openCalendar = () => {
    const base = parseIso(value || today);
    hostRef.current = document.querySelector(".screen") ?? document.body;
    setCursor({ y: base.y, m: base.m });
    setOpen(true);
  };

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
    <div className="date-field">
      <button type="button" className="date-shell" onClick={openCalendar}>
        <div className="date-shell-text">
          <strong>{formatSpeakDate(value || today)}</strong>
          <span>{formatKoreanDate(value || today)}</span>
        </div>
        <span className="date-shell-hint">변경</span>
      </button>

      {open &&
        hostRef.current &&
        createPortal(
        <div className="cal-scrim" onClick={() => setOpen(false)}>
          <div
            className="cal-panel"
            role="dialog"
            aria-label="날짜 선택"
            onClick={(event) => event.stopPropagation()}
          >
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
              {cells.map((cell, index) =>
                cell ? (
                  <button
                    key={cell.iso}
                    type="button"
                    className={[
                      "cal-day",
                      cell.iso === value ? "on" : "",
                      cell.iso === today ? "today" : "",
                      cell.outside ? "muted" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={cell.outside}
                    onClick={() => {
                      onChange(cell.iso);
                      setOpen(false);
                    }}
                  >
                    {cell.day}
                  </button>
                ) : (
                  <span key={`e-${index}`} className="cal-empty" />
                ),
              )}
            </div>
            <div className="cal-chips">
              <button
                type="button"
                className="cal-today"
                onClick={() => {
                  onChange(today);
                  setOpen(false);
                }}
              >
                오늘
              </button>
              <button
                type="button"
                className="cal-today"
                onClick={() => {
                  onChange(yesterday);
                  setOpen(false);
                }}
              >
                어제
              </button>
            </div>
          </div>
        </div>,
        hostRef.current,
      )}
    </div>
  );
}
