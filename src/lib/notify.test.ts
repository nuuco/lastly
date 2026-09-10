import { describe, expect, it } from "vitest";
import { listInboxTargets, listLateOrSoon } from "./notify";
import type { RecordRow } from "./types";

function row(
  partial: Pick<RecordRow, "actionKey" | "actionLabel" | "lastPerformedOn"> &
    Partial<RecordRow>,
): RecordRow {
  return {
    lastUtterance: "",
    inputPath: "manual",
    schedule: partial.schedule ?? null,
    aliases: [],
    memo: "",
    snoozeUntil: null,
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...partial,
  };
}

describe("listInboxTargets", () => {
  const now = new Date("2026-09-10T12:00:00+09:00");

  it("지남과 오늘 예정만 넣고 곧(D-1~)은 뺀다", () => {
    const rows = [
      row({
        actionKey: "late",
        actionLabel: "지난 일",
        lastPerformedOn: "2026-08-01",
        schedule: { kind: "everyDays", days: 7 },
      }),
      row({
        actionKey: "today",
        actionLabel: "오늘 예정",
        lastPerformedOn: "2026-09-07",
        schedule: { kind: "everyDays", days: 3 },
      }),
      row({
        actionKey: "soon",
        actionLabel: "내일 예정",
        lastPerformedOn: "2026-09-08",
        schedule: { kind: "everyDays", days: 3 },
      }),
      row({
        actionKey: "ok",
        actionLabel: "여유",
        lastPerformedOn: "2026-09-01",
        schedule: { kind: "everyDays", days: 20 },
      }),
    ];

    const soonish = listLateOrSoon(rows, now).map((r) => r.actionKey);
    expect(soonish).toEqual(["late", "today", "soon"]);

    const inbox = listInboxTargets(rows, now).map((r) => r.actionKey);
    expect(inbox).toEqual(["late", "today"]);
  });
});
