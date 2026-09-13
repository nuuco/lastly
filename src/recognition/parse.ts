import type { ParseResult } from "../lib/types";
import { todayKst } from "../lib/kst";
import { classifyUtterance, guessAction } from "./utteranceRules";
import { extractRelativeDate } from "./dates";
import { extractSchedule } from "./intervals";
import { disposeWhisper } from "./stt";
import { getGemmaConsent } from "./gemmaConsent";
import {
  extractWithGemma,
  getGemmaLoadError,
  loadGemma,
  matchWithGemma,
  setGemmaProgressHandler,
} from "./gemmaOnDevice";

export type LfmSlots = {
  intent: ParseResult["utteranceType"] | null;
  action: string | null;
  date: string | null;
  interval: string | null;
};

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

let onProgress: ((label: string) => void) | null = null;

export function setParseProgressHandler(
  handler: ((label: string) => void) | null,
) {
  onProgress = handler;
  setGemmaProgressHandler(handler);
}

export function getLfmLoadError(): string | null {
  return getGemmaLoadError();
}

/** 이해 모델(Gemma) 로드. 동의 전이면 silent는 그냥 넘어가고, 말하기 중이면 규칙으로 간다. */
export async function loadLfm(options?: { silent?: boolean }): Promise<void> {
  if (getGemmaConsent() !== "accepted") {
    if (options?.silent) return;
    throw new Error("이해 모델 동의가 필요해요");
  }
  if (isAndroid()) disposeWhisper();
  await loadGemma({ silent: options?.silent });
}

const MAX_MATCH_LABELS = 24;

/** 기존 기록 이름 중에서 같은 행위인지 Gemma가 고른다. 다르면 null */
export async function matchActionWithLfm(
  query: string,
  labels: string[],
): Promise<string | null> {
  const unique = [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
  if (!query.trim() || unique.length === 0) return null;
  if (getGemmaConsent() !== "accepted") return null;
  onProgress?.("같은 일인지 보고 있어요");
  await loadLfm();
  const picked = unique.slice(0, MAX_MATCH_LABELS);
  return matchWithGemma(query.trim(), picked);
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
    provider: "gemma3-1b",
    reason:
      rules.utteranceType === "incomplete"
        ? `${rules.reason} · 부정은 규칙 유지`
        : rules.utteranceType === "completed" &&
            extracted.intent &&
            extracted.intent !== "completed"
          ? `${rules.reason} · 완료 표지는 규칙 유지`
          : `Gemma 유형 ${utteranceType} · 할일·날짜·주기 추출`,
  };
}

export async function parseUtterance(raw: string): Promise<ParseResult> {
  const rules = classifyUtterance(raw);

  try {
    onProgress?.("할일과 날짜를 정리하는 중");
    await loadLfm();
    const extracted = await extractWithGemma(raw, todayKst());
    return applyLfmSlots(raw, rules, extracted);
  } catch {
    const loadError = getGemmaLoadError();
    const noConsent = getGemmaConsent() !== "accepted";
    return {
      ...rules,
      date: extractRelativeDate(raw)?.date ?? rules.date,
      provider: "utterance-rules",
      reason: noConsent
        ? `${rules.reason} · 규칙으로 이해`
        : loadError
          ? `${rules.reason} · 이해 모델을 못 열어 규칙만 사용`
          : rules.reason,
    };
  }
}
