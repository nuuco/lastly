import { describe, expect, it } from "vitest";
import { classifyUtterance } from "./utteranceRules";

const completed = [
  "오늘 이불 빨았어",
  "어제 정수기 필터 갈았어",
  "그저께 화장실 청소했다",
];
const planned = [
  "내일 이불 빨 거야",
  "주말에 필터 바꿀 예정이야",
  "모레 에어컨 청소하려고",
];
const incomplete = [
  "오늘 이불 못 빨았어",
  "필터 아직 안 갈았어",
  "오늘 빨래는 못 했고 설거지만 했어",
];
const uncertain = [
  "지난주쯤 이불 빨았던 것 같은데",
  "필터 언제 갈았더라",
  "아마 어제 청소했던가",
];

describe("골든셋 규칙 게이트", () => {
  it.each(completed)("completed: %s", (text) => {
    expect(classifyUtterance(text).utteranceType).toBe("completed");
  });
  it.each(planned)("planned: %s", (text) => {
    expect(classifyUtterance(text).utteranceType).toBe("planned");
  });
  it.each(incomplete)("incomplete: %s", (text) => {
    expect(classifyUtterance(text).utteranceType).toBe("incomplete");
  });
  it.each(uncertain)("uncertain: %s", (text) => {
    expect(classifyUtterance(text).utteranceType).toBe("uncertain");
  });
});
