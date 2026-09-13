import { describe, expect, it } from "vitest";
import { formatOrtError } from "./pinOrtWasm";

describe("formatOrtError", () => {
  it("함수 불일치 에러는 빌드 어긋남으로 읽힌다", () => {
    expect(formatOrtError(new Error("TypeError: d is not a function"))).toContain(
      "빌드",
    );
  });

  it("일반 메시지는 그대로 둔다", () => {
    expect(formatOrtError(new Error("no available backend found"))).toBe(
      "no available backend found",
    );
  });
});
