import { describe, expect, it } from "vitest";
import { addDaysIso, isOverdue } from "../lib/kst";
import { matchRecords, resolveRecordMatch, answerPhrase } from "./lookup";
import type { RecordRow } from "../lib/types";

const row = (
  label: string,
  date: string,
  interval: number | null = null,
  aliases: string[] = [],
): RecordRow => ({
  actionKey: label,
  actionLabel: label,
  lastPerformedOn: date,
  lastUtterance: label,
  inputPath: "voice",
  schedule: interval != null ? { kind: "everyDays", days: interval } : null,
  aliases,
  memo: "",
  snoozeUntil: null,
  updatedAt: "2026-09-06T00:00:00.000Z",
});

describe("lookup", () => {
  it("행동명을 매칭한다", () => {
    const rows = [row("이불 빨래", "2026-09-02"), row("필터 교체", "2026-08-01")];
    const hit = matchRecords("이불 빨래", rows);
    expect(hit.kind).toBe("exact");
    if (hit.kind === "exact" || hit.kind === "similar") {
      expect(hit.row.actionLabel).toBe("이불 빨래");
    }
  });

  it("동의어는 비슷함으로 물어보게 한다", () => {
    const rows = [row("이불 빨래", "2026-09-02")];
    const laundry = matchRecords("이불 세탁", rows);
    expect(laundry.kind).toBe("similar");
    if (laundry.kind === "similar") {
      expect(laundry.row.actionLabel).toBe("이불 빨래");
    }
    const bedding = matchRecords("침구", rows);
    expect(bedding.kind).toBe("similar");
    if (bedding.kind === "similar") {
      expect(bedding.row.actionLabel).toBe("이불 빨래");
    }
  });

  it("별칭이 있으면 같은 항목으로 본다", () => {
    const rows = [row("이불 빨래", "2026-09-02", null, ["침구 세탁"])];
    const hit = matchRecords("침구 세탁", rows);
    expect(hit.kind).toBe("exact");
    if (hit.kind === "exact") {
      expect(hit.row.actionLabel).toBe("이불 빨래");
    }
  });

  it("대상이 다른 청소는 비슷한 항목이 아니다", () => {
    const rows = [
      row("화장실 청소", "2026-09-02"),
      row("선풍기 청소", "2026-09-01"),
    ];
    expect(matchRecords("에어컨 청소", rows).kind).toBe("none");
  });

  it("대상만 같고 일이 다르면 비슷한 항목이 아니다", () => {
    const rows = [row("강아지 예방접종", "2026-09-02")];
    expect(matchRecords("강아지 산책", rows).kind).toBe("none");
    expect(matchRecords("강아지 산책을", rows).kind).toBe("none");
  });

  it("대상만 말하면 그 대상의 기록에 잇는다", () => {
    const rows = [row("강아지 예방접종", "2026-09-02")];
    const hit = matchRecords("강아지", rows);
    expect(hit.kind).toBe("similar");
    if (hit.kind === "similar") {
      expect(hit.row.actionLabel).toBe("강아지 예방접종");
    }
  });

  it("저장은 LFM이 다른 행위면 잇지 않는다", async () => {
    const rows = [row("강아지 예방접종", "2026-09-02")];
    const hit = await resolveRecordMatch(
      "강아지 산책",
      rows,
      "save",
      async () => null,
    );
    expect(hit.kind).toBe("none");
  });

  it("저장은 LFM이 같은 행위면 잇는다", async () => {
    const rows = [row("이불 빨래", "2026-09-02")];
    const hit = await resolveRecordMatch(
      "시트 빨기",
      rows,
      "save",
      async () => "이불 빨래",
    );
    expect(hit.kind).toBe("similar");
    if (hit.kind === "similar") {
      expect(hit.row.actionLabel).toBe("이불 빨래");
    }
  });

  it("동의어 집합이 같으면 저장에 LFM을 부르지 않는다", async () => {
    const rows = [row("이불 빨래", "2026-09-02")];
    let called = 0;
    const hit = await resolveRecordMatch(
      "이불 세탁",
      rows,
      "save",
      async () => {
        called += 1;
        return null;
      },
    );
    expect(called).toBe(0);
    expect(hit.kind).toBe("similar");
  });

  it("답변 문구를 만든다", () => {
    const now = new Date("2026-09-06T12:00:00+09:00");
    expect(answerPhrase(row("이불 빨래", "2026-09-06"), now)).toBe(
      "이불 빨래는 오늘 했어요.",
    );
    expect(answerPhrase(row("이불 빨래", "2026-09-05"), now)).toBe(
      "이불 빨래는 어제 했어요.",
    );
    expect(answerPhrase(row("이불 빨래", "2026-09-02"), now)).toBe(
      "이불 빨래는 9월 2일에 했어요. 4일 지났어요.",
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
