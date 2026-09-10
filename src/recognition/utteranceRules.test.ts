import { describe, expect, it } from "vitest";
import { FROZEN_NOW, resolveDateToken } from "./evalFixtures";
import { classifyUtterance } from "./utteranceRules";

describe("classifyUtterance", () => {
  it("완료+앞으로 주기는 완료로 저장한다", () => {
    const result = classifyUtterance(
      "빨래 어제 했고 이주마다 앞으로 하려고",
      FROZEN_NOW,
    );
    expect(result.utteranceType).toBe("completed");
    expect(result.action).toBe("빨래");
    expect(result.date).toBe(resolveDateToken("어제"));
    expect(result.schedule).toEqual({ kind: "everyWeeks", weeks: 2 });
  });

  it("완료 없이 하려고만 있으면 예정이다", () => {
    const result = classifyUtterance("모레 에어컨 청소하려고", FROZEN_NOW);
    expect(result.utteranceType).toBe("planned");
    expect(result.date).toBeNull();
  });

  it("언제 했는지 알려 줘는 조회다", () => {
    const result = classifyUtterance(
      "시트 세탁 언제 했는지 알려 줘",
      FROZEN_NOW,
    );
    expect(result.utteranceType).toBe("query");
    expect(result.action).toBe("시트 세탁");
  });

  it("짧은 ‘함’도 완료다", () => {
    const result = classifyUtterance("베란다 청소 오늘 함", FROZEN_NOW);
    expect(result.utteranceType).toBe("completed");
    expect(result.date).toBe(resolveDateToken("오늘"));
  });
});
