import { describe, expect, it } from "vitest";
import { parseIntent } from "./intent";

describe("parseIntent", () => {
  it("영·한글 별칭을 유형으로 바꾼다", () => {
    expect(parseIntent("query")).toBe("query");
    expect(parseIntent("조회")).toBe("query");
    expect(parseIntent("completed")).toBe("completed");
    expect(parseIntent("완료")).toBe("completed");
    expect(parseIntent("unknown")).toBeNull();
  });
});
