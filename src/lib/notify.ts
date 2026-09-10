import type { RecordRow, ReminderSchedule } from "./types";
import { dueInfo, isOverdue, todayKst } from "./kst";
import {
  lastDigestDate,
  loadNotifySettings,
  markNotificationAsked,
  setLastDigestDate,
  shouldRunDigest,
} from "./settings";
import { listOpenInbox, upsertInboxItem } from "../storage/records";

const ASKED_KEY = "lastly.notifyAsked";

export function listOverdue(rows: RecordRow[], now = new Date()): RecordRow[] {
  return rows.filter((row) => {
    const info = dueInfo(
      row.lastPerformedOn,
      row.schedule,
      row.snoozeUntil,
      now,
    );
    return info?.kind === "late";
  });
}

export function listLateOrSoon(
  rows: RecordRow[],
  now = new Date(),
): Array<RecordRow & { dueOn: string }> {
  const out: Array<RecordRow & { dueOn: string }> = [];
  for (const row of rows) {
    const info = dueInfo(
      row.lastPerformedOn,
      row.schedule,
      row.snoozeUntil,
      now,
    );
    if (info && (info.kind === "late" || info.kind === "soon")) {
      out.push({ ...row, dueOn: info.dueOn });
    }
  }
  return out;
}

/** 알림함 대상: 지남 + 오늘이 예정일인 것만 (D-1~D-3 곧은 제외) */
export function listInboxTargets(
  rows: RecordRow[],
  now = new Date(),
): Array<RecordRow & { dueOn: string }> {
  const out: Array<RecordRow & { dueOn: string }> = [];
  for (const row of rows) {
    const info = dueInfo(
      row.lastPerformedOn,
      row.schedule,
      row.snoozeUntil,
      now,
    );
    if (!info) continue;
    if (info.kind === "late" || info.daysToDue === 0) {
      out.push({ ...row, dueOn: info.dueOn });
    }
  }
  return out;
}

export function sortRecordsForList(rows: RecordRow[]): RecordRow[] {
  return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
  markNotificationAsked();
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

export function notifyLateOrSoon(
  rows: Array<{ actionLabel: string; memo?: string }>,
): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (rows.length === 0) return;
  const title =
    rows.length === 1
      ? `${rows[0].actionLabel} 알림`
      : `지남·오늘 예정 ${rows.length}건`;
  const body =
    rows.length === 1
      ? rows[0].memo?.trim() ||
        "주기가 지났거나 오늘이에요. 하셨다면 기록해 주세요."
      : rows
          .slice(0, 3)
          .map((r) => r.actionLabel)
          .join(", ") + (rows.length > 3 ? "…" : "");
  try {
    new Notification(title, { body, tag: "lastly-due" });
  } catch {
    // ignore
  }
}

/** @deprecated 배너용 — Sprint 2에서는 알림함 사용 */
export function notifyOverdue(rows: RecordRow[]): void {
  notifyLateOrSoon(listOverdue(rows));
}

export function overdueSummary(rows: RecordRow[]): string | null {
  const due = listOverdue(rows);
  if (due.length === 0) return null;
  if (due.length === 1) return `${due[0].actionLabel} 주기가 지났어요`;
  return `지난 일 ${due.length}건 · 눌러 보기`;
}

/**
 * 앱 오픈 시: 설정·주말·시각을 보고 지남·오늘 예정만 알림함에 넣고 OS 알림.
 * 하루 한 번만 OS 알림(digest).
 */
export async function syncInboxOnOpen(
  rows: RecordRow[],
  now = new Date(),
): Promise<{ created: number; notified: boolean }> {
  const settings = loadNotifySettings();
  if (!shouldRunDigest(settings, now)) {
    return { created: 0, notified: false };
  }

  const targets = listInboxTargets(rows, now);
  let created = 0;
  for (const row of targets) {
    const before = await listOpenInbox();
    const had = before.some(
      (i) => i.actionKey === row.actionKey && i.dueOn === row.dueOn,
    );
    await upsertInboxItem({ actionKey: row.actionKey, dueOn: row.dueOn });
    if (!had) created += 1;
  }

  const today = todayKst(now);
  const already = lastDigestDate() === today;
  let notified = false;
  if (!already && targets.length > 0) {
    notifyLateOrSoon(targets);
    setLastDigestDate(today);
    notified = true;
  }

  return { created, notified };
}

export { isOverdue };
