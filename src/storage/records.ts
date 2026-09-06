import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { InputPath, RecordRow, ReminderSchedule } from "../lib/types";
import { todayKst } from "../lib/kst";
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
    updatedAt: raw.updatedAt,
  };
}

function db() {
  if (!dbPromise) {
    dbPromise = openDB<LastlyDb>("lastly", 4, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const store = database.createObjectStore("records", {
            keyPath: "actionKey",
          });
          store.createIndex("updatedAt", "updatedAt");
        }
        // v3: schedule. 예전 intervalDays는 normalizeRow에서 이관
        // v4: aliases. 기존 행은 normalizeRow에서 []
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
    updatedAt: new Date().toISOString(),
  };
  await database.put("records", row);
  return row;
}

/** 이름·날짜·주기 수정. 이름이 바뀌면 예전 키를 지우고 새 키로 옮긴다. */
export async function updateRecord(input: {
  previousKey: string;
  actionLabel: string;
  lastPerformedOn: string;
  schedule?: ReminderSchedule | null;
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
}

export async function listRecords(): Promise<RecordRow[]> {
  const database = await db();
  const rows = await database.getAllFromIndex("records", "updatedAt");
  return rows.reverse().map(normalizeRow);
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
