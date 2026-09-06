import { describe, expect, it } from "vitest";
import { isValidPerformedOn, normalizeActionKey, normalizeRow } from "./records";

describe("normalizeActionKey", () => {
  it("공백을 한 칸으로 맞춘다", () => {
    expect(normalizeActionKey(" 이불   빨래 ")).toBe("이불 빨래");
  });
});

describe("isValidPerformedOn", () => {
  it("올바른 날짜만 통과한다", () => {
    expect(isValidPerformedOn("2026-09-06")).toBe(true);
    expect(isValidPerformedOn("2026-13-01")).toBe(false);
    expect(isValidPerformedOn("어제")).toBe(false);
  });
});

describe("normalizeRow", () => {
  const base = {
    actionKey: "빨래",
    actionLabel: "빨래",
    lastPerformedOn: "2026-09-01",
    lastUtterance: "빨래 했어",
    inputPath: "voice" as const,
    updatedAt: "2026-09-06T00:00:00.000Z",
  };

  it("구버전 intervalDays만 있으면 everyDays로 옮긴다", () => {
    expect(normalizeRow({ ...base, intervalDays: 7 }).schedule).toEqual({
      kind: "everyDays",
      days: 7,
    });
  });

  it("schedule이 있으면 intervalDays는 무시한다", () => {
    expect(
      normalizeRow({
        ...base,
        schedule: { kind: "weekly", weekday: 1 },
        intervalDays: 7,
      }).schedule,
    ).toEqual({ kind: "weekly", weekday: 1 });
  });
});
