import { describe, expect, it } from "vitest";
import { extractSchedule } from "./intervals";

describe("extractSchedule", () => {
  it("상대 주기를 일수로 바꾼다", () => {
    expect(extractSchedule("일주일마다 알려줘")?.schedule).toEqual({
      kind: "everyDays",
      days: 7,
    });
    expect(extractSchedule("3일마다")?.schedule).toEqual({
      kind: "everyDays",
      days: 3,
    });
    expect(extractSchedule("보름마다")?.schedule).toEqual({
      kind: "everyDays",
      days: 15,
    });
    expect(extractSchedule("그냥 했어")).toBeNull();
  });

  it("매주·매월 날짜·몇째 주 요일을 파싱한다", () => {
    expect(extractSchedule("매주 금요일 알려줘")?.schedule).toEqual({
      kind: "weekly",
      weekday: 5,
    });
    expect(extractSchedule("매월 마지막 수요일")?.schedule).toEqual({
      kind: "monthlyNthWeekday",
      nth: -1,
      weekday: 3,
    });
    expect(extractSchedule("매월 10일마다 알려줘")?.schedule).toEqual({
      kind: "monthlyDay",
      day: 10,
    });
    expect(extractSchedule("매월 둘째 일요일")?.schedule).toEqual({
      kind: "monthlyNthWeekday",
      nth: 2,
      weekday: 0,
    });
  });

  it("주·월·년 간격을 파싱한다", () => {
    expect(extractSchedule("한 달마다 알려줘")?.schedule).toEqual({
      kind: "everyMonths",
      months: 1,
    });
    expect(extractSchedule("3개월마다")?.schedule).toEqual({
      kind: "everyMonths",
      months: 3,
    });
    expect(extractSchedule("매년 알려줘")?.schedule).toEqual({
      kind: "everyYears",
      years: 1,
    });
    expect(extractSchedule("2주마다")?.schedule).toEqual({
      kind: "everyWeeks",
      weeks: 2,
    });
  });
});
