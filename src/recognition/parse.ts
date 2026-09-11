import type { ParseResult, UtteranceType } from "../lib/types";
import { todayKst } from "../lib/kst";
import { classifyUtterance, guessAction } from "./utteranceRules";
import { extractRelativeDate } from "./dates";
import { extractSchedule } from "./intervals";
import { disposeWhisper } from "./stt";
import { understandLoadLabel } from "./progressLabel";

type LfmOut =
  | { type: "ready"; device: "webgpu" | "wasm"; model: string }
  | { type: "progress"; info: { status?: string; progress?: number; file?: string } }
  | {
      type: "result";
      utteranceType: UtteranceType | null;
      action: string | null;
      date: string | null;
      interval: string | null;
      device: "webgpu" | "wasm";
      latencyMs: number;
      model: string;
      raw: string;
    }
  | { type: "error"; message: string };

export type LfmSlots = {
  intent: UtteranceType | null;
  action: string | null;
  date: string | null;
  interval: string | null;
};

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
        onProgress?.(understandLoadLabel(data.info));
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
  return new Promise<LfmSlots>((resolve, reject) => {
    const handle = (event: MessageEvent<LfmOut>) => {
      const data = event.data;
      if (data.type === "result") {
        current.removeEventListener("message", handle);
        resolve({
          intent: data.utteranceType,
          action: data.action,
          date: data.date,
          interval: data.interval,
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

function looksIso(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function cleanInterval(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "null" || s === "없음" || s === "none") return null;
  return s;
}

/** 못/안 미완료는 규칙이 고정. 그 외 유형·할일·날짜·주기는 LFM을 우선 */
export function applyLfmSlots(
  raw: string,
  rules: ParseResult,
  extracted: LfmSlots,
  now = new Date(),
): ParseResult {
  const lfmAction = extracted.action?.trim() || null;
  const cleanedLfm = lfmAction ? guessAction(lfmAction) : null;
  const action = cleanedLfm || lfmAction || rules.action;

  const relative = extractRelativeDate(raw, now);
  const date = relative?.date
    ?? (looksIso(extracted.date) ? extracted.date : null)
    ?? rules.date;

  const fromLfm = extractSchedule(cleanInterval(extracted.interval) ?? "");
  const schedule = rules.schedule ?? fromLfm?.schedule ?? null;

  const utteranceType =
    rules.utteranceType === "incomplete"
      ? "incomplete"
      : rules.utteranceType === "completed"
        ? "completed"
        : (extracted.intent ?? rules.utteranceType);

  return {
    ...rules,
    utteranceType,
    action,
    date: utteranceType === "planned" ? null : date,
    schedule,
    confidenceSource: "llm",
    provider: "lfm2.5-350m-q4",
    reason:
      rules.utteranceType === "incomplete"
        ? `${rules.reason} · 부정은 규칙 유지`
        : rules.utteranceType === "completed" &&
            extracted.intent &&
            extracted.intent !== "completed"
          ? `${rules.reason} · 완료 표지는 규칙 유지`
          : `LFM 유형 ${utteranceType} · 할일·날짜·주기 추출`,
  };
}

export async function parseUtterance(raw: string): Promise<ParseResult> {
  const rules = classifyUtterance(raw);

  try {
    onProgress?.("할일과 날짜를 정리하는 중");
    await loadLfm();
    const extracted = await extractWithLfm(raw, todayKst());
    return applyLfmSlots(raw, rules, extracted);
  } catch {
    return {
      ...rules,
      date: extractRelativeDate(raw)?.date ?? rules.date,
      provider: "utterance-rules",
      reason: lastError
        ? `${rules.reason} · LFM 로드 실패, 규칙만 사용`
        : rules.reason,
    };
  }
}
