import { describe, expect, it } from "vitest";
import { extractIntervalDays, extractSchedule } from "./intervals";
import { classifyUtterance } from "./utteranceRules";

describe("extractIntervalDays", () => {
  it("상대 주기를 일수로 바꾼다", () => {
    expect(extractIntervalDays("일주일마다 알려줘")?.days).toBe(7);
    expect(extractIntervalDays("3일마다")?.days).toBe(3);
    expect(extractIntervalDays("보름마다")?.days).toBe(15);
    expect(extractIntervalDays("그냥 했어")).toBeNull();
  });
});

describe("extractSchedule", () => {
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

describe("query + interval classify", () => {
  it("조회 문장을 query로 본다", () => {
    expect(classifyUtterance("나 이불 빨래 언제 했어?").utteranceType).toBe(
      "query",
    );
    expect(classifyUtterance("필터 갈아끼운 지 며칠이야?").utteranceType).toBe(
      "query",
    );
  });

  it("언제 갈았더라는 여전히 uncertain", () => {
    expect(classifyUtterance("필터 언제 갈았더라").utteranceType).toBe(
      "uncertain",
    );
  });

  it("완료+주기를 같이 파싱한다", () => {
    const result = classifyUtterance("오늘 이불 빨았어, 일주일마다 알려줘");
    expect(result.utteranceType).toBe("completed");
    expect(result.intervalDays).toBe(7);
    expect(result.schedule).toEqual({ kind: "everyDays", days: 7 });
  });
});
