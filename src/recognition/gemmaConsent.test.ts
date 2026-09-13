import { describe, expect, it } from "vitest";
import { gemmaNetworkHint } from "./gemmaConsent";

describe("gemmaNetworkHint", () => {
  it("Wi-Fi는 wifi", () => {
    expect(gemmaNetworkHint({ type: "wifi" })).toBe("wifi");
  });

  it("셀룰러·데이터 절약은 cellular", () => {
    expect(gemmaNetworkHint({ type: "cellular" })).toBe("cellular");
    expect(gemmaNetworkHint({ saveData: true })).toBe("cellular");
  });

  it("정보 없으면 unknown", () => {
    expect(gemmaNetworkHint(null)).toBe("unknown");
    expect(gemmaNetworkHint(undefined)).toBe("unknown");
  });
});
