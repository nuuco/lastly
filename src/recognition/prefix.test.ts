import { describe, expect, it } from "vitest";
import { stripPrefix } from "./prefix";

describe("stripPrefix", () => {
  it("라스틀리만 제거한다", () => {
    expect(stripPrefix("라스틀리, 이불 빨았어")).toBe("이불 빨았어");
    expect(stripPrefix("라스, 이불 빨았어")).toBe("라스, 이불 빨았어");
    expect(stripPrefix("이불 빨았어")).toBe("이불 빨았어");
  });
});
