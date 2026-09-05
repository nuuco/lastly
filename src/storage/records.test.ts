import { describe, expect, it } from "vitest";
import { isValidPerformedOn, normalizeActionKey } from "./records";

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
