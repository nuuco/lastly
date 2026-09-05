import { describe, expect, it } from "vitest";
import { classifyUtterance } from "./utteranceRules";
import { stripPrefix } from "./prefix";

describe("stripPrefix", () => {
  it("라스틀리만 제거한다", () => {
    expect(stripPrefix("라스틀리, 이불 빨았어")).toBe("이불 빨았어");
    expect(stripPrefix("라스, 이불 빨았어")).toBe("라스, 이불 빨았어");
    expect(stripPrefix("이불 빨았어")).toBe("이불 빨았어");
  });
});

describe("classifyUtterance", () => {
  it("완료 문장을 completed로 본다", () => {
    expect(classifyUtterance("오늘 이불 빨았어").utteranceType).toBe(
      "completed",
    );
    expect(classifyUtterance("어제 정수기 필터 갈았어").utteranceType).toBe(
      "completed",
    );
  });

  it("못/안이면 completed를 막는다", () => {
    expect(classifyUtterance("오늘 이불 못 빨았어").utteranceType).toBe(
      "incomplete",
    );
    expect(classifyUtterance("필터 아직 안 갈았어").utteranceType).toBe(
      "incomplete",
    );
    expect(
      classifyUtterance("오늘 빨래는 못 했고 설거지만 했어").utteranceType,
    ).toBe("incomplete");
  });

  it("예정 문장은 저장하지 않는다", () => {
    expect(classifyUtterance("내일 이불 빨 거야").utteranceType).toBe(
      "planned",
    );
    expect(classifyUtterance("주말에 필터 바꿀 예정이야").utteranceType).toBe(
      "planned",
    );
  });

  it("애매한 문장은 uncertain이다", () => {
    expect(
      classifyUtterance("지난주쯤 이불 빨았던 것 같은데").utteranceType,
    ).toBe("uncertain");
    expect(classifyUtterance("필터 언제 갈았더라").utteranceType).toBe(
      "uncertain",
    );
  });
});
