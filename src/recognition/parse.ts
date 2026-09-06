import type { ParseResult } from "../lib/types";
import { todayKst } from "../lib/kst";
import { classifyUtterance, skipLlm } from "./utteranceRules";
import { extractRelativeDate } from "./dates";
import { disposeWhisper } from "./stt";

type LfmOut =
  | { type: "ready"; device: "webgpu" | "wasm"; model: string }
  | { type: "progress"; info: { status?: string; progress?: number; file?: string } }
  | {
      type: "result";
      action: string | null;
      date: string | null;
      device: "webgpu" | "wasm";
      latencyMs: number;
      model: string;
      raw: string;
    }
  | { type: "error"; message: string };

let worker: Worker | null = null;
let loadPromise: Promise<void> | null = null;
let onProgress: ((label: string) => void) | null = null;
let lastError: string | null = null;

export function setParseProgressHandler(
  handler: ((label: string) => void) | null,
) {
  onProgress = handler;
}

export function getLfmLoadError(): string | null {
  return lastError;
}

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./lfm.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return worker;
}

export async function loadLfm(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (isAndroid()) disposeWhisper();
  const current = getWorker();
  loadPromise = new Promise((resolve, reject) => {
    const handle = (event: MessageEvent<LfmOut>) => {
      const data = event.data;
      if (data.type === "progress") {
        const pct = data.info.progress
          ? `${Math.round(data.info.progress)}%`
          : "";
        onProgress?.(
          `LFM2.5 준비 ${data.info.file ?? ""} ${pct}`.trim(),
        );
      }
      if (data.type === "ready") {
        current.removeEventListener("message", handle);
        lastError = null;
        resolve();
      }
      if (data.type === "error") {
        current.removeEventListener("message", handle);
        lastError = data.message;
        loadPromise = null;
        reject(new Error(data.message));
      }
    };
    current.addEventListener("message", handle);
    current.postMessage({ type: "load" });
  });
  return loadPromise;
}

function extractWithLfm(text: string, today: string) {
  const current = getWorker();
  return new Promise<{ action: string | null; date: string | null }>(
    (resolve, reject) => {
      const handle = (event: MessageEvent<LfmOut>) => {
        const data = event.data;
        if (data.type === "result") {
          current.removeEventListener("message", handle);
          resolve({ action: data.action, date: data.date });
        }
        if (data.type === "error") {
          current.removeEventListener("message", handle);
          lastError = data.message;
          reject(new Error(data.message));
        }
      };
      current.addEventListener("message", handle);
      current.postMessage({ type: "extract", text, today });
    },
  );
}

function looksIso(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function parseUtterance(raw: string): Promise<ParseResult> {
  const rules = classifyUtterance(raw);

  if (skipLlm(rules.utteranceType)) {
    return rules;
  }

  const relative = extractRelativeDate(raw);
  if (rules.utteranceType === "completed" && rules.action && relative) {
    return {
      ...rules,
      date: relative.date,
      confidenceSource: "regex",
      provider: "utterance-rules+date-regex",
    };
  }

  try {
    onProgress?.("행동과 날짜를 정리하는 중");
    await loadLfm();
    const extracted = await extractWithLfm(raw, todayKst());
    return {
      ...rules,
      action: extracted.action || rules.action,
      date: looksIso(extracted.date)
        ? extracted.date
        : (relative?.date ?? rules.date),
      provider: "lfm2.5-350m-q4",
      reason: `${rules.reason} · LFM이 행동·날짜를 보완`,
    };
  } catch {
    return {
      ...rules,
      date: relative?.date ?? rules.date,
      provider: "utterance-rules",
      reason: lastError
        ? `${rules.reason} · LFM 로드 실패, 규칙만 사용`
        : rules.reason,
    };
  }
}
