import { describe, expect, it } from "vitest";
import { daysBetween, dueDatesInRange } from "./kst";

describe("dueDatesInRange", () => {
  it("2일마다면 구간의 해당일을 모두 낸다", () => {
    expect(
      dueDatesInRange(
        "2026-09-01",
        { kind: "everyDays", days: 2 },
        "2026-09-01",
        "2026-09-10",
      ),
    ).toEqual(["2026-09-03", "2026-09-05", "2026-09-07", "2026-09-09"]);
  });

  it("2주마다면 14일 간격으로 낸다", () => {
    expect(
      dueDatesInRange(
        "2026-09-01",
        { kind: "everyWeeks", weeks: 2 },
        "2026-09-01",
        "2026-09-30",
      ),
    ).toEqual(["2026-09-15", "2026-09-29"]);
  });

  it("매주 금요일이면 그 달 금요일을 낸다", () => {
    expect(
      dueDatesInRange(
        "2026-09-01",
        { kind: "weekly", weekday: 5 },
        "2026-09-01",
        "2026-09-30",
      ),
    ).toEqual(["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"]);
  });

  it("매월 10일이면 그 달 10일만 낸다", () => {
    expect(
      dueDatesInRange(
        "2026-08-15",
        { kind: "monthlyDay", day: 10 },
        "2026-09-01",
        "2026-09-30",
      ),
    ).toEqual(["2026-09-10"]);
  });

  it("주기가 없으면 비운다", () => {
    expect(
      dueDatesInRange("2026-09-01", null, "2026-09-01", "2026-09-30"),
    ).toEqual([]);
  });

  it("먼 과거 수행일도 현재 달 간격만 맞춘다", () => {
    const dates = dueDatesInRange(
      "2020-01-01",
      { kind: "everyDays", days: 2 },
      "2026-09-01",
      "2026-09-07",
    );
    expect(dates.length).toBeGreaterThan(1);
    expect(dates[0] >= "2026-09-01").toBe(true);
    expect(dates.at(-1)! <= "2026-09-07").toBe(true);
    for (let i = 1; i < dates.length; i += 1) {
      expect(daysBetween(dates[i - 1], dates[i])).toBe(2);
    }
  });
});
