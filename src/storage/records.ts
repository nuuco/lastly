import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  InboxItem,
  InboxStatus,
  InputPath,
  RecordRow,
  ReminderSchedule,
} from "../lib/types";
import { addDaysIso, todayKst } from "../lib/kst";
import {
  normalizeSchedule,
  scheduleFromIntervalDays,
} from "../recognition/intervals";

interface LastlyDb extends DBSchema {
  records: {
    key: string;
    value: RecordRow;
    indexes: { updatedAt: string };
  };
  inbox: {
    key: string;
    value: InboxItem;
    indexes: { createdAt: string; actionKey: string };
  };
}

let dbPromise: Promise<IDBPDatabase<LastlyDb>> | null = null;

/** IndexedDB에 남아 있을 수 있는 구버전 필드 */
type StoredRecord = Partial<RecordRow> &
  Pick<
    RecordRow,
    | "actionKey"
    | "actionLabel"
    | "lastPerformedOn"
    | "lastUtterance"
    | "inputPath"
    | "updatedAt"
  > & {
    intervalDays?: number | null;
  };

/** 저장 행을 현재 스키마로 맞춤. intervalDays는 읽기 이관만 */
export function normalizeAliases(
  aliases: string[] | undefined,
  actionLabel: string,
): string[] {
  const key = normalizeActionKey(actionLabel);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of aliases ?? []) {
    const next = normalizeActionKey(raw);
    if (!next || next === key || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

export function mergeAliases(
  previous: string[] | undefined,
  actionLabel: string,
  extra?: string | null,
): string[] {
  const extras = extra ? [...(previous ?? []), extra] : (previous ?? []);
  return normalizeAliases(extras, actionLabel);
}

export function normalizeRow(raw: StoredRecord): RecordRow {
  const schedule = normalizeSchedule(
    raw.schedule ?? scheduleFromIntervalDays(raw.intervalDays),
  );
  return {
    actionKey: raw.actionKey,
    actionLabel: raw.actionLabel,
    lastPerformedOn: raw.lastPerformedOn,
    lastUtterance: raw.lastUtterance,
    inputPath: raw.inputPath,
    schedule,
    aliases: normalizeAliases(raw.aliases, raw.actionLabel),
    memo: typeof raw.memo === "string" ? raw.memo : "",
    snoozeUntil:
      typeof raw.snoozeUntil === "string" && raw.snoozeUntil
        ? raw.snoozeUntil
        : null,
    updatedAt: raw.updatedAt,
  };
}

function db() {
  if (!dbPromise) {
    dbPromise = openDB<LastlyDb>("lastly", 5, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const store = database.createObjectStore("records", {
            keyPath: "actionKey",
          });
          store.createIndex("updatedAt", "updatedAt");
        }
        // v3: schedule. 예전 intervalDays는 normalizeRow에서 이관
        // v4: aliases. 기존 행은 normalizeRow에서 []
        // v5: memo, snoozeUntil + inbox
        if (oldVersion < 5 && !database.objectStoreNames.contains("inbox")) {
          const inbox = database.createObjectStore("inbox", {
            keyPath: "id",
          });
          inbox.createIndex("createdAt", "createdAt");
          inbox.createIndex("actionKey", "actionKey");
        }
      },
    });
  }
  return dbPromise;
}

export function normalizeActionKey(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

export async function upsertRecord(input: {
  actionLabel: string;
  lastPerformedOn: string;
  lastUtterance: string;
  inputPath: InputPath;
  schedule?: ReminderSchedule | null;
  aliasToAdd?: string | null;
  memo?: string;
  clearSnooze?: boolean;
}): Promise<RecordRow> {
  const database = await db();
  const actionKey = normalizeActionKey(input.actionLabel);
  const previous = await database.get("records", actionKey);
  const prev = previous ? normalizeRow(previous) : null;
  const schedule =
    input.schedule !== undefined ? input.schedule : (prev?.schedule ?? null);

  const row: RecordRow = {
    actionKey,
    actionLabel: input.actionLabel.trim(),
    lastPerformedOn: input.lastPerformedOn,
    lastUtterance: input.lastUtterance,
    inputPath: input.inputPath,
    schedule,
    aliases: mergeAliases(prev?.aliases, input.actionLabel, input.aliasToAdd),
    memo: input.memo !== undefined ? input.memo : (prev?.memo ?? ""),
    snoozeUntil: input.clearSnooze ? null : (prev?.snoozeUntil ?? null),
    updatedAt: new Date().toISOString(),
  };
  await database.put("records", row);
  return row;
}

/** 이름·날짜·주기·메모 수정. 이름이 바뀌면 예전 키를 지우고 새 키로 옮긴다. */
export async function updateRecord(input: {
  previousKey: string;
  actionLabel: string;
  lastPerformedOn: string;
  schedule?: ReminderSchedule | null;
  memo?: string;
  snoozeUntil?: string | null;
}): Promise<RecordRow> {
  const database = await db();
  const previous = await database.get("records", input.previousKey);
  const prev = previous ? normalizeRow(previous) : null;
  const nextKey = normalizeActionKey(input.actionLabel);
  const schedule =
    input.schedule !== undefined ? input.schedule : (prev?.schedule ?? null);

  const row: RecordRow = {
    actionKey: nextKey,
    actionLabel: input.actionLabel.trim(),
    lastPerformedOn: input.lastPerformedOn,
    lastUtterance: prev?.lastUtterance ?? input.actionLabel.trim(),
    inputPath: prev?.inputPath ?? "manual",
    schedule,
    aliases: mergeAliases(prev?.aliases, input.actionLabel),
    memo: input.memo !== undefined ? input.memo : (prev?.memo ?? ""),
    snoozeUntil:
      input.snoozeUntil !== undefined
        ? input.snoozeUntil
        : (prev?.snoozeUntil ?? null),
    updatedAt: new Date().toISOString(),
  };
  await database.put("records", row);
  if (input.previousKey !== nextKey) {
    await database.delete("records", input.previousKey);
  }
  return row;
}

export async function deleteRecord(actionKey: string): Promise<void> {
  const database = await db();
  await database.delete("records", actionKey);
  await markInboxByAction(actionKey, "done");
}

export async function listRecords(): Promise<RecordRow[]> {
  const database = await db();
  const rows = await database.getAllFromIndex("records", "updatedAt");
  return rows.reverse().map(normalizeRow);
}

export async function getRecord(
  actionKey: string,
): Promise<RecordRow | undefined> {
  const database = await db();
  const raw = await database.get("records", actionKey);
  return raw ? normalizeRow(raw) : undefined;
}

export async function clearAllRecords(): Promise<void> {
  const database = await db();
  await database.clear("records");
  await database.clear("inbox");
}

/** 빈 DB일 때만 샘플. 지남·곧·여유·주기없음·메모 섞어 넣음 */
export async function seedDemoIfEmpty(now = new Date()): Promise<number> {
  const existing = await listRecords();
  if (existing.length > 0) return 0;
  return seedDemoRecords(now);
}

/** 설정 등에서 샘플을 다시 넣을 때(기존 키는 upsert) */
export async function seedDemoRecords(now = new Date()): Promise<number> {
  const today = todayKst(now);
  const samples: Array<{
    actionLabel: string;
    lastPerformedOn: string;
    schedule: ReminderSchedule | null;
    memo: string;
    lastUtterance: string;
  }> = [
    {
      actionLabel: "이불 빨래",
      lastPerformedOn: addDaysIso(today, -20),
      schedule: { kind: "everyDays", days: 14 },
      memo: "커버만 돌림",
      lastUtterance: "이불 빨래 했어",
    },
    {
      actionLabel: "에어컨 필터",
      lastPerformedOn: addDaysIso(today, -28),
      schedule: { kind: "everyDays", days: 30 },
      memo: "거실",
      lastUtterance: "에어컨 필터 청소했어",
    },
    {
      actionLabel: "비타민",
      lastPerformedOn: addDaysIso(today, -5),
      schedule: { kind: "everyDays", days: 7 },
      memo: "아침 식후",
      lastUtterance: "비타민 먹었어",
    },
    {
      actionLabel: "화장실 청소",
      lastPerformedOn: addDaysIso(today, -3),
      schedule: { kind: "everyDays", days: 14 },
      memo: "세정제 거의 없음",
      lastUtterance: "화장실 청소했어",
    },
    {
      actionLabel: "강아지 예방접종",
      lastPerformedOn: addDaysIso(today, -1),
      schedule: null,
      memo: "병원 예약해 둠",
      lastUtterance: "강아지 예방접종 했어",
    },
  ];

  for (const s of samples) {
    await upsertRecord({
      actionLabel: s.actionLabel,
      lastPerformedOn: s.lastPerformedOn,
      lastUtterance: s.lastUtterance,
      inputPath: "manual",
      schedule: s.schedule,
      memo: s.memo,
      clearSnooze: true,
    });
  }
  return samples.length;
}

export function inboxId(actionKey: string, dueOn: string): string {
  return `${actionKey}::${dueOn}`;
}

export async function upsertInboxItem(input: {
  actionKey: string;
  dueOn: string;
}): Promise<InboxItem> {
  const database = await db();
  const id = inboxId(input.actionKey, input.dueOn);
  const existing = await database.get("inbox", id);
  if (existing && existing.status === "open") {
    return existing;
  }
  if (existing && existing.status === "done") {
    return existing;
  }
  const item: InboxItem = {
    id,
    actionKey: input.actionKey,
    dueOn: input.dueOn,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    read: existing?.read ?? false,
    status: "open",
  };
  await database.put("inbox", item);
  return item;
}

export async function listInbox(): Promise<InboxItem[]> {
  const database = await db();
  const rows = await database.getAllFromIndex("inbox", "createdAt");
  return rows.reverse();
}

export async function listOpenInbox(): Promise<InboxItem[]> {
  const rows = await listInbox();
  return rows.filter((r) => r.status === "open");
}

export async function markInbox(
  id: string,
  patch: Partial<Pick<InboxItem, "read" | "status">>,
): Promise<void> {
  const database = await db();
  const existing = await database.get("inbox", id);
  if (!existing) return;
  await database.put("inbox", { ...existing, ...patch });
}

export async function markInboxByAction(
  actionKey: string,
  status: InboxStatus,
): Promise<void> {
  const database = await db();
  const rows = await database.getAllFromIndex("inbox", "actionKey", actionKey);
  for (const row of rows) {
    if (row.status === "open") {
      await database.put("inbox", { ...row, status, read: true });
    }
  }
}

export function emptyPerformedOn(): string {
  return todayKst();
}

export function isValidPerformedOn(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

/** 이름·별칭·메모 검색용 정규화 */
export function searchHaystack(row: RecordRow): string {
  return normalizeActionKey(
    [row.actionLabel, ...(row.aliases ?? []), row.memo]
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();
}

export function matchesSearch(row: RecordRow, query: string): boolean {
  const q = normalizeActionKey(query).toLowerCase();
  if (!q) return true;
  return searchHaystack(row).includes(q);
}
