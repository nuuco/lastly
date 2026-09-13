import { describe, expect, it } from "vitest";
import { hasWebGpu, ortDeviceOrder, probeWebGpu } from "./ortDevice";

describe("ortDeviceOrder", () => {
  it("GPU가 있으면 WebGPU를 먼저 연다", () => {
    expect(ortDeviceOrder("Mozilla/5.0", true)).toEqual(["webgpu", "wasm"]);
  });

  it("GPU가 없으면 WASM만 연다", () => {
    expect(ortDeviceOrder("Mozilla/5.0", false)).toEqual(["wasm"]);
  });

  it("hasWebGpu는 값이 있을 때만 true", () => {
    expect(hasWebGpu(undefined)).toBe(false);
    expect(hasWebGpu({})).toBe(true);
  });

  it("probeWebGpu는 requestAdapter 성공만 true", async () => {
    expect(await probeWebGpu(undefined)).toBe(false);
    expect(await probeWebGpu({ requestAdapter: async () => ({}) })).toBe(true);
    expect(
      await probeWebGpu({
        requestAdapter: async () => {
          throw new Error("no");
        },
      }),
    ).toBe(false);
  });
});
