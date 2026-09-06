import type { RecordRow, ReminderSchedule } from "../lib/types";
import { isOverdue } from "../lib/kst";

const ASKED_KEY = "lastly.notifyAsked";

export function listOverdue(rows: RecordRow[], now = new Date()): RecordRow[] {
  return rows.filter((row) =>
    isOverdue(row.lastPerformedOn, row.schedule, now),
  );
}

export function sortRecordsForList(
  rows: RecordRow[],
  now = new Date(),
): RecordRow[] {
  return [...rows].sort((a, b) => {
    const aDue = isOverdue(a.lastPerformedOn, a.schedule, now) ? 0 : 1;
    const bDue = isOverdue(b.lastPerformedOn, b.schedule, now) ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function ensureNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  if (localStorage.getItem(ASKED_KEY) === "1") {
    return Notification.permission;
  }
  localStorage.setItem(ASKED_KEY, "1");
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** 주기를 처음 켤 때만 권한 요청 */
export async function maybeAskNotificationOnInterval(
  previous: ReminderSchedule | number | null | undefined,
  next: ReminderSchedule | number | null | undefined,
): Promise<void> {
  const had =
    previous != null &&
    (typeof previous === "number" ? previous >= 1 : true);
  const has =
    next != null && (typeof next === "number" ? next >= 1 : true);
  if (!had && has) {
    await ensureNotificationPermission();
  }
}

export function notifyOverdue(rows: RecordRow[]): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const due = listOverdue(rows);
  if (due.length === 0) return;
  const title =
    due.length === 1
      ? `${due[0].actionLabel} 알림`
      : `주기가 지난 일 ${due.length}건`;
  const body =
    due.length === 1
      ? "주기가 지났어요. 오늘 하셨다면 기록해 주세요."
      : due
          .slice(0, 3)
          .map((r) => r.actionLabel)
          .join(", ") + (due.length > 3 ? "…" : "");
  try {
    new Notification(title, { body, tag: "lastly-overdue" });
  } catch {
    // ignore
  }
}

export function overdueSummary(rows: RecordRow[]): string | null {
  const due = listOverdue(rows);
  if (due.length === 0) return null;
  if (due.length === 1) return `${due[0].actionLabel} 주기가 지났어요`;
  return `주기가 지난 일 ${due.length}건 · 눌러 보기`;
}
