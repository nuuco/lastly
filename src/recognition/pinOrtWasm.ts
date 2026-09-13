import { env } from "@huggingface/transformers";

type OrtWasmEnv = {
  wasmPaths?: string | { mjs?: string | URL; wasm?: string | URL };
  numThreads?: number;
  proxy?: boolean;
  simd?: boolean | "fixed" | "relaxed";
  wasmBinary?: ArrayBufferLike | Uint8Array;
};

function wasmEnv(): OrtWasmEnv {
  const wasm = env.backends.onnx?.wasm as OrtWasmEnv | undefined;
  if (!wasm) {
    throw new Error("ORT wasm env 없음 — transformers import 실패");
  }
  return wasm;
}

function ortRuntimeBase(): string {
  return `${self.location.origin}/ort-runtime/`;
}

/**
 * Chrome 우선: 패키지 기본 번들(ort.bundle = jsep glue) + 같은 빌드의 jsep.wasm만 경로 지정.
 * mjs를 따로 덮어쓰지 않는다. (JS/WASM 짝 깨짐 방지)
 */
export function pinOrtWasm() {
  const wasm = wasmEnv();
  delete wasm.wasmBinary;
  wasm.wasmPaths = {
    wasm: `${ortRuntimeBase()}ort-wasm-simd-threaded.jsep.wasm`,
  };
  wasm.proxy = false;
  wasm.numThreads = 1;
}

export async function probeOrtRuntime(): Promise<string> {
  pinOrtWasm();
  const url = `${ortRuntimeBase()}ort-wasm-simd-threaded.jsep.wasm`;
  const response = await fetch(url, {
    method: "HEAD",
    credentials: "same-origin",
  });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    throw new Error(`ORT jsep.wasm HEAD ${response.status} ${url}`);
  }
  return `jsep.wasm HEAD ${response.status} ${type} isolated=${String(self.crossOriginIsolated)}`;
}

export function describeOrtWasm(): string {
  try {
    const wasm = wasmEnv();
    return `numThreads=${wasm.numThreads ?? "?"} paths=${JSON.stringify(wasm.wasmPaths)}`;
  } catch {
    return "wasm env 없음";
  }
}

export function formatOrtError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const trimmed = raw.trim();
  if (/is not a function/i.test(trimmed)) {
    return `${trimmed} · ORT JS와 WASM 빌드가 어긋난 신호`;
  }
  if (trimmed === "9966304" || trimmed === "10290256") {
    return `${trimmed} · ONNX WASM 세션 abort (Safari/jsep면 Chrome에서 재시도)`;
  }
  if (trimmed === "10290344") {
    return `${trimmed} · ONNX GPU(WebGPU) 세션 abort`;
  }
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed} · ONNX가 브라우저 세션을 못 열었습니다`;
  }
  return raw;
}
