export type OrtDevice = "webgpu" | "wasm";

export function isSafariBrowser(userAgent: string): boolean {
  return /Safari/i.test(userAgent) && !/Chrome|CriOS|Android|Edg/i.test(userAgent);
}

export function hasWebGpu(gpu: unknown): boolean {
  return Boolean(gpu);
}

export async function probeWebGpu(
  gpu?: { requestAdapter?: () => Promise<unknown> },
): Promise<boolean> {
  if (!gpu?.requestAdapter) return false;
  try {
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

/**
 * Chrome 우선: 어댑터가 있으면 WebGPU → WASM.
 * 실패 시 호출 쪽에서 워커를 버리고 다음 장치를 연다.
 */
export function ortDeviceOrder(
  _userAgent: string,
  gpuAvailable = false,
): OrtDevice[] {
  if (gpuAvailable) return ["webgpu", "wasm"];
  return ["wasm"];
}
