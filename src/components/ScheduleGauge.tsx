import type { ScheduleProgress } from "../lib/kst";
import { formatScheduleLabel } from "../recognition/intervals";
import type { ReminderSchedule } from "../lib/types";

type Props = {
  progress: ScheduleProgress;
  schedule: ReminderSchedule | null;
  /** 마지막 수행 후 경과일 */
  elapsed: number;
};

function lastLabel(elapsed: number): string {
  return elapsed === 0 ? "마지막 오늘" : `마지막 ${elapsed}일 전`;
}

export default function ScheduleGauge({ progress, schedule, elapsed }: Props) {
  const due = progress.status === "due";
  const scheduleText = formatScheduleLabel(schedule);
  return (
    <div className="gauge">
      <div className="track">
        <div
          className={`fill fill-${progress.status}`}
          style={{ width: `${progress.pct}%` }}
        />
      </div>
      <div className="meta">
        <span className={due ? "due-text" : undefined}>{lastLabel(elapsed)}</span>
        {scheduleText ? <b>{scheduleText}</b> : null}
      </div>
    </div>
  );
}
