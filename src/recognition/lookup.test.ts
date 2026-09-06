import { describe, expect, it } from "vitest";
import { addDaysIso, isOverdue } from "../lib/kst";
import { matchRecords, answerPhrase } from "./lookup";
import type { RecordRow } from "../lib/types";

const row = (label: string, date: string, interval: number | null = null): RecordRow => ({
  actionKey: label,
  actionLabel: label,
  lastPerformedOn: date,
  lastUtterance: label,
  inputPath: "voice",
  schedule: interval != null ? { kind: "everyDays", days: interval } : null,
  updatedAt: "2026-09-06T00:00:00.000Z",
});

describe("lookup", () => {
  it("행동명을 매칭한다", () => {
    const rows = [row("이불 빨래", "2026-09-02"), row("필터 교체", "2026-08-01")];
    const hit = matchRecords("이불 빨래", rows);
    expect(hit.kind).toBe("exact");
    if (hit.kind === "exact" || hit.kind === "partial") {
      expect(hit.row.actionLabel).toBe("이불 빨래");
    }
  });

  it("답변 문구를 만든다", () => {
    const now = new Date("2026-09-06T12:00:00+09:00");
    expect(answerPhrase(row("이불 빨래", "2026-09-02"), now)).toContain(
      "이불 빨래",
    );
    expect(answerPhrase(row("이불 빨래", "2026-09-02"), now)).toContain(
      "4일 지났어요",
    );
  });
});

describe("overdue", () => {
  it("주기 초과를 계산한다", () => {
    const now = new Date("2026-09-06T12:00:00+09:00");
    expect(addDaysIso("2026-09-01", 7)).toBe("2026-09-08");
    expect(isOverdue("2026-08-01", 7, now)).toBe(true);
    expect(isOverdue("2026-09-05", 7, now)).toBe(false);
    expect(isOverdue("2026-08-01", null, now)).toBe(false);
  });
});
