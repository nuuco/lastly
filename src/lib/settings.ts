import type { NotifySettings } from "./types";

const TIME_KEY = "lastly.notifyTime";
const WEEKENDS_KEY = "lastly.notifyWeekends";
const ENABLED_KEY = "lastly.notifyEnabled";
const ASKED_KEY = "lastly.notifyAsked";
const LAST_DIGEST_KEY = "lastly.lastDigestDate";

export function normalizeNotifyTime(value: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 표시용: 오전 9:05 */
export function formatNotifyTimeLabel(value: string): string {
  const normalized = normalizeNotifyTime(value) ?? "09:00";
  const [hh, mm] = normalized.split(":").map(Number);
  const period = hh < 12 ? "오전" : "오후";
  const hour12 = ((hh + 11) % 12) + 1;
  return `${period} ${hour12}:${String(mm).padStart(2, "0")}`;
}

export function parseNotifyTimeParts(value: string): {
  period: "am" | "pm";
  hour12: number;
  minute: number;
} {
  const normalized = normalizeNotifyTime(value) ?? "09:00";
  const [hh, mm] = normalized.split(":").map(Number);
  return {
    period: hh < 12 ? "am" : "pm",
    hour12: ((hh + 11) % 12) + 1,
    minute: mm,
  };
}

export function composeNotifyTime(
  period: "am" | "pm",
  hour12: number,
  minute: number,
): string {
  const h = hour12 % 12;
  const hh = period === "am" ? h : h + 12;
  return `${String(hh).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const VOICE_GUIDE_KEY = "lastly.voiceGuide";

/** 음성 안내(TTS). 기본 켜짐 */
export function loadVoiceGuideEnabled(): boolean {
  try {
    const raw = localStorage.getItem(VOICE_GUIDE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    // ignore
  }
  return true;
}

export function saveVoiceGuideEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(VOICE_GUIDE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

export function loadNotifySettings(): NotifySettings {
  let enabled = true;
  let time = "09:00";
  let weekends = true;
  try {
    const e = localStorage.getItem(ENABLED_KEY);
    if (e === "0") enabled = false;
    if (e === "1") enabled = true;
    const raw = localStorage.getItem(TIME_KEY);
    const normalized = raw ? normalizeNotifyTime(raw) : null;
    if (normalized) time = normalized;
    const w = localStorage.getItem(WEEKENDS_KEY);
    if (w === "0") weekends = false;
    if (w === "1") weekends = true;
  } catch {
    // ignore
  }
  return { enabled, time, weekends };
}

export function saveNotifySettings(next: NotifySettings): void {
  try {
    localStorage.setItem(ENABLED_KEY, next.enabled ? "1" : "0");
    const time = normalizeNotifyTime(next.time) ?? "09:00";
    localStorage.setItem(TIME_KEY, time);
    localStorage.setItem(WEEKENDS_KEY, next.weekends ? "1" : "0");
  } catch {
    // ignore
  }
}

export function notificationAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markNotificationAsked(): void {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // ignore
  }
}

export function lastDigestDate(): string | null {
  try {
    return localStorage.getItem(LAST_DIGEST_KEY);
  } catch {
    return null;
  }
}

export function setLastDigestDate(isoDate: string): void {
  try {
    localStorage.setItem(LAST_DIGEST_KEY, isoDate);
  } catch {
    // ignore
  }
}

/** HH:mm 과 지금(KST) 비교 — 설정 시각이 지났으면 true */
export function notifyTimePassed(
  time: string,
  now = new Date(),
): boolean {
  const [hh, mm] = time.split(":").map(Number);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute >= hh * 60 + mm;
}

export function isWeekendKst(now = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(now);
  return weekday === "Sat" || weekday === "Sun";
}

/** 앱 오픈 시 알림함/OS 알림을 돌릴지 */
export function shouldRunDigest(settings: NotifySettings, now = new Date()): boolean {
  if (!settings.enabled) return false;
  if (!settings.weekends && isWeekendKst(now)) return false;
  return notifyTimePassed(settings.time, now);
}

export function permissionLabel(
  permission: NotificationPermission | "unsupported",
): string {
  if (permission === "unsupported") return "지원 안 함";
  if (permission === "granted") return "허용됨";
  if (permission === "denied") return "거부됨";
  return "아직 안 물음";
}
