import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  composeNotifyTime,
  formatNotifyTimeLabel,
  normalizeNotifyTime,
  parseNotifyTimeParts,
} from "../lib/settings";

type Props = {
  value: string;
  onChange: (next: string) => void;
};

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const ITEM_H = 40;

function WheelColumn({
  items,
  value,
  onChange,
  format = String,
}: {
  items: number[];
  value: number;
  onChange: (next: number) => void;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ignoreScroll = useRef(false);
  const timer = useRef(0);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const idx = Math.max(0, items.indexOf(value));
    ignoreScroll.current = true;
    root.scrollTop = idx * ITEM_H;
    window.setTimeout(() => {
      ignoreScroll.current = false;
    }, 80);
  }, [items, value]);

  const pickFromScroll = () => {
    const root = ref.current;
    if (!root || ignoreScroll.current) return;
    const idx = Math.min(
      items.length - 1,
      Math.max(0, Math.round(root.scrollTop / ITEM_H)),
    );
    const next = items[idx];
    if (next !== value) onChange(next);
  };

  return (
    <div className="time-wheel" ref={ref} onScroll={() => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(pickFromScroll, 60);
    }}>
      <div className="time-wheel-pad" />
      {items.map((n) => (
        <button
          key={n}
          type="button"
          className={`time-wheel-item${n === value ? " on" : ""}`}
          onClick={() => {
            onChange(n);
            const root = ref.current;
            if (!root) return;
            const idx = items.indexOf(n);
            ignoreScroll.current = true;
            root.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
            window.setTimeout(() => {
              ignoreScroll.current = false;
            }, 220);
          }}
        >
          {format(n)}
        </button>
      ))}
      <div className="time-wheel-pad" />
    </div>
  );
}

export default function TimePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<"am" | "pm">("am");
  const [hour12, setHour12] = useState(9);
  const [minute, setMinute] = useState(0);
  const hostRef = useRef<Element | null>(null);

  const openPicker = () => {
    const parts = parseNotifyTimeParts(value);
    setPeriod(parts.period);
    setHour12(parts.hour12);
    setMinute(parts.minute);
    hostRef.current = document.querySelector(".screen") ?? document.body;
    setOpen(true);
  };

  const confirm = () => {
    const next = normalizeNotifyTime(composeNotifyTime(period, hour12, minute));
    if (next) onChange(next);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="settings-time-btn"
        onClick={openPicker}
        aria-label="알림 받을 시간"
      >
        {formatNotifyTimeLabel(value)}
      </button>

      {open &&
        hostRef.current &&
        createPortal(
          <div
            className="time-scrim"
            onClick={() => setOpen(false)}
          >
            <div
              className="time-panel"
              role="dialog"
              aria-label="시간 선택"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="time-panel-head">
                <span>알림 받을 시간</span>
                <button
                  type="button"
                  className="sheet-x"
                  aria-label="닫기"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className="time-period">
                <button
                  type="button"
                  className={period === "am" ? "on" : ""}
                  onClick={() => setPeriod("am")}
                >
                  오전
                </button>
                <button
                  type="button"
                  className={period === "pm" ? "on" : ""}
                  onClick={() => setPeriod("pm")}
                >
                  오후
                </button>
              </div>

              <div className="time-wheels">
                <div className="time-wheel-highlight" aria-hidden />
                <WheelColumn
                  items={HOURS}
                  value={hour12}
                  onChange={setHour12}
                />
                <span className="time-colon">:</span>
                <WheelColumn
                  items={MINUTES}
                  value={minute}
                  onChange={setMinute}
                  format={(n) => String(n).padStart(2, "0")}
                />
              </div>

              <button type="button" className="confirm" onClick={confirm}>
                이 시간으로
              </button>
            </div>
          </div>,
          hostRef.current,
        )}
    </>
  );
}
