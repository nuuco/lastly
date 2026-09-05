import type { ParseResult } from "../lib/types";
import { todayKst } from "../lib/kst";
import { classifyUtterance, skipLlm } from "./utteranceRules";
import { extractRelativeDate } from "./dates";
import { extractSchedule, intervalDaysFromSchedule } from "./intervals";
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
  // 주기 문구는 규칙으로 다시 한 번 확정 (LFM이 덮어쓰지 않음)
  const scheduleHit = extractSchedule(raw);
  const withSchedule: ParseResult = {
    ...rules,
    schedule: scheduleHit?.schedule ?? rules.schedule,
    intervalDays:
      intervalDaysFromSchedule(scheduleHit?.schedule ?? rules.schedule) ??
      rules.intervalDays,
  };

  if (skipLlm(withSchedule.utteranceType)) {
    return withSchedule;
  }

  const relative = extractRelativeDate(raw);
  if (withSchedule.utteranceType === "completed" && withSchedule.action && relative) {
    return {
      ...withSchedule,
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
      ...withSchedule,
      action: extracted.action || withSchedule.action,
      date: looksIso(extracted.date)
        ? extracted.date
        : (relative?.date ?? withSchedule.date),
      provider: "lfm2.5-350m-q4",
      reason: `${withSchedule.reason} · LFM이 행동·날짜를 보완`,
    };
  } catch {
    return {
      ...withSchedule,
      date: relative?.date ?? withSchedule.date,
      provider: "utterance-rules",
      reason: lastError
        ? `${withSchedule.reason} · LFM 로드 실패, 규칙만 사용`
        : withSchedule.reason,
    };
  }
}
