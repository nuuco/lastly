import type { UtteranceType } from "../lib/types";
import { todayKst } from "../lib/kst";

const MODEL_PATH = "/models/gemma3-1b-it-int4-web.task";

type GemmaOut =
  | { type: "ready"; model: string }
  | { type: "log"; message: string }
  | {
      type: "result";
      utteranceType: UtteranceType | null;
      action: string | null;
      date: string | null;
      interval: string | null;
      latencyMs: number;
      model: string;
      raw: string;
    }
  | {
      type: "match-result";
      label: string | null;
      latencyMs: number;
      raw: string;
    }
  | { type: "disposed" }
  | { type: "error"; message: string };

export type GemmaExtract = {
  intent: UtteranceType | null;
  action: string | null;
  date: string | null;
  interval: string | null;
  latencyMs: number;
  model: string;
  raw: string;
};

let worker: Worker | null = null;
let loadPromise: Promise<void> | null = null;
let lastError: string | null = null;
let onProgress: ((label: string) => void) | null = null;
let reportProgress = true;
let ready = false;

export function isGemmaReady(): boolean {
  return ready && Boolean(worker);
}

export function setGemmaProgressHandler(
  handler: ((label: string) => void) | null,
) {
  onProgress = handler;
}

export function getGemmaLoadError(): string | null {
  return lastError;
}

const MIN_MODEL_BYTES = 100 * 1024 * 1024;

export async function probeGemmaModel(): Promise<{
  ok: boolean;
  status: number;
  bytes: number | null;
}> {
  const response = await fetch(MODEL_PATH, {
    method: "HEAD",
    credentials: "same-origin",
  });
  const type = response.headers.get("content-type") ?? "";
  const lengthHeader = response.headers.get("content-length");
  const bytes = lengthHeader ? Number(lengthHeader) : null;
  const looksHtml = type.includes("text/html");
  const tooSmall = bytes != null && bytes < MIN_MODEL_BYTES;
  return {
    ok: response.ok && !looksHtml && !tooSmall,
    status: response.status,
    bytes,
  };
}

function spawnWorker() {
  worker?.terminate();
  worker = new Worker(new URL("./gemma.worker.ts", import.meta.url), {
    type: "module",
  });
  return worker;
}

export async function loadGemma(options?: { silent?: boolean }): Promise<void> {
  if (!options?.silent) reportProgress = true;
  if (loadPromise) return loadPromise;
  reportProgress = options?.silent !== true;
  const gpu = (navigator as { gpu?: { requestAdapter?: () => Promise<unknown> } })
    .gpu;
  if (!gpu?.requestAdapter) {
    lastError = "WebGPU 없음 — Chrome에서 열어 주세요";
    throw new Error(lastError);
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      lastError = "WebGPU 어댑터 없음";
      throw new Error(lastError);
    }
  } catch (error) {
    lastError =
      error instanceof Error ? error.message : "WebGPU 어댑터를 못 열었습니다";
    throw new Error(lastError);
  }
  const file = await probeGemmaModel();
  if (!file.ok) {
    lastError = "이해 모델을 아직 받을 수 없어요";
    throw new Error(lastError);
  }
  if (reportProgress) onProgress?.("이해할 준비를 하고 있어요");
  const current = spawnWorker();
  loadPromise = new Promise<void>((resolve, reject) => {
    const handle = (event: MessageEvent<GemmaOut>) => {
      const data = event.data;
      if (data.type === "log") {
        if (reportProgress) onProgress?.(data.message);
        return;
      }
      if (data.type === "ready") {
        current.removeEventListener("message", handle);
        lastError = null;
        ready = true;
        reportProgress = true;
        resolve();
      }
      if (data.type === "error") {
        current.removeEventListener("message", handle);
        lastError = data.message;
        current.terminate();
        if (worker === current) worker = null;
        loadPromise = null;
        ready = false;
        reportProgress = true;
        reject(new Error(data.message));
      }
    };
    current.addEventListener("message", handle);
    current.postMessage({ type: "load" });
  });
  return loadPromise;
}

export function disposeGemma() {
  worker?.terminate();
  worker = null;
  loadPromise = null;
  ready = false;
}

export async function extractWithGemma(
  text: string,
  today = todayKst(),
): Promise<GemmaExtract> {
  await loadGemma();
  const current = worker;
  if (!current) throw new Error("Gemma 워커가 없습니다");
  return new Promise((resolve, reject) => {
    const handle = (event: MessageEvent<GemmaOut>) => {
      const data = event.data;
      if (data.type === "log") {
        onProgress?.(data.message);
        return;
      }
      if (data.type === "result") {
        current.removeEventListener("message", handle);
        resolve({
          intent: data.utteranceType,
          action: data.action,
          date: data.date,
          interval: data.interval,
          latencyMs: data.latencyMs,
          model: data.model,
          raw: data.raw,
        });
      }
      if (data.type === "error") {
        current.removeEventListener("message", handle);
        lastError = data.message;
        reject(new Error(data.message));
      }
    };
    current.addEventListener("message", handle);
    current.postMessage({ type: "extract", text, today });
  });
}

export async function matchWithGemma(
  query: string,
  labels: string[],
): Promise<string | null> {
  await loadGemma();
  const current = worker;
  if (!current) throw new Error("Gemma 워커가 없습니다");
  return new Promise((resolve, reject) => {
    const handle = (event: MessageEvent<GemmaOut>) => {
      const data = event.data;
      if (data.type === "log") {
        onProgress?.(data.message);
        return;
      }
      if (data.type === "match-result") {
        current.removeEventListener("message", handle);
        resolve(data.label);
      }
      if (data.type === "error") {
        current.removeEventListener("message", handle);
        lastError = data.message;
        reject(new Error(data.message));
      }
    };
    current.addEventListener("message", handle);
    current.postMessage({ type: "match", query, labels });
  });
}
