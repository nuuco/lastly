import type { ScheduleProgress } from "../lib/kst";
import { formatScheduleLabel } from "../recognition/intervals";
import type { ReminderSchedule } from "../lib/types";

type Props = {
  progress: ScheduleProgress;
  schedule: ReminderSchedule | null;
};

function nextLabel(progress: ScheduleProgress): string {
  if (progress.status === "due") {
    if (progress.daysLeft < 0) return `${Math.abs(progress.daysLeft)}일 지남`;
    return "오늘이 관리일";
  }
  return `다음 관리 D-${progress.daysLeft}`;
}

export default function ScheduleGauge({ progress, schedule }: Props) {
  const due = progress.status === "due";
  return (
    <div className="gauge">
      <div className="track">
        <div
          className={`fill fill-${progress.status}`}
          style={{ width: `${progress.pct}%` }}
        />
      </div>
      <div className="meta">
        <b>{formatScheduleLabel(schedule)}</b>
        <span className={due ? "due-text" : undefined}>{nextLabel(progress)}</span>
      </div>
    </div>
  );
}
