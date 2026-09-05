import { describe, expect, it } from "vitest";
import { extractRelativeDate } from "./dates";

describe("extractRelativeDate", () => {
  const now = new Date("2026-09-05T12:00:00+09:00");

  it("오늘 어제 그저께를 계산한다", () => {
    expect(extractRelativeDate("오늘 이불 빨았어", now)?.date).toBe(
      "2026-09-05",
    );
    expect(extractRelativeDate("어제 필터 갈았어", now)?.date).toBe(
      "2026-09-04",
    );
    expect(extractRelativeDate("그저께 청소했다", now)?.date).toBe("2026-09-03");
  });
});
