import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { InputPath, RecordRow, ReminderSchedule } from "../lib/types";
import { todayKst } from "../lib/kst";
import {
  intervalDaysFromSchedule,
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

/** v1/v2 row를 schedule 기준으로 정규화 */
export function normalizeRow(
  raw: Partial<RecordRow> &
    Pick<
      RecordRow,
      | "actionKey"
      | "actionLabel"
      | "lastPerformedOn"
      | "lastUtterance"
      | "inputPath"
      | "updatedAt"
    >,
): RecordRow {
  const schedule = normalizeSchedule(
    raw.schedule ?? scheduleFromIntervalDays(raw.intervalDays ?? null),
  );
  return {
    actionKey: raw.actionKey,
    actionLabel: raw.actionLabel,
    lastPerformedOn: raw.lastPerformedOn,
    lastUtterance: raw.lastUtterance,
    inputPath: raw.inputPath,
    schedule,
    intervalDays: intervalDaysFromSchedule(schedule),
    updatedAt: raw.updatedAt,
  };
}

function db() {
  if (!dbPromise) {
    dbPromise = openDB<LastlyDb>("lastly", 3, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const store = database.createObjectStore("records", {
            keyPath: "actionKey",
          });
          store.createIndex("updatedAt", "updatedAt");
        }
        // v2: intervalDays, v3: schedule — 읽기 시 normalizeRow
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
  intervalDays?: number | null;
  schedule?: ReminderSchedule | null;
}): Promise<RecordRow> {
  const database = await db();
  const actionKey = normalizeActionKey(input.actionLabel);
  const previous = await database.get("records", actionKey);
  const prev = previous ? normalizeRow(previous) : null;

  let schedule: ReminderSchedule | null;
  if (input.schedule !== undefined) {
    schedule = input.schedule;
  } else if (input.intervalDays !== undefined) {
    schedule = scheduleFromIntervalDays(input.intervalDays);
  } else {
    schedule = prev?.schedule ?? null;
  }

  const row: RecordRow = {
    actionKey,
    actionLabel: input.actionLabel.trim(),
    lastPerformedOn: input.lastPerformedOn,
    lastUtterance: input.lastUtterance,
    inputPath: input.inputPath,
    schedule,
    intervalDays: intervalDaysFromSchedule(schedule),
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
  intervalDays?: number | null;
  schedule?: ReminderSchedule | null;
}): Promise<RecordRow> {
  const database = await db();
  const previous = await database.get("records", input.previousKey);
  const prev = previous ? normalizeRow(previous) : null;
  const nextKey = normalizeActionKey(input.actionLabel);

  let schedule: ReminderSchedule | null;
  if (input.schedule !== undefined) {
    schedule = input.schedule;
  } else if (input.intervalDays !== undefined) {
    schedule = scheduleFromIntervalDays(input.intervalDays);
  } else {
    schedule = prev?.schedule ?? null;
  }

  const row: RecordRow = {
    actionKey: nextKey,
    actionLabel: input.actionLabel.trim(),
    lastPerformedOn: input.lastPerformedOn,
    lastUtterance: prev?.lastUtterance ?? input.actionLabel.trim(),
    inputPath: prev?.inputPath ?? "manual",
    schedule,
    intervalDays: intervalDaysFromSchedule(schedule),
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

export function isValidIntervalDays(value: number | null): boolean {
  if (value === null) return true;
  return Number.isInteger(value) && value >= 1 && value <= 365;
}
