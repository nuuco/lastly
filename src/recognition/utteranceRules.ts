import type { ParseResult, UtteranceType } from "../lib/types";
import { extractRelativeDate } from "./dates";
import { extractSchedule, stripIntervalPhrase } from "./intervals";
import { stripPrefix } from "./prefix";

const INCOMPLETE = [
  /못\s*했/,
  /못\s*갈/,
  /못\s*빨/,
  /못\s*닦/,
  /못\s*버리/,
  /못\s*돌리/,
  /못\s*시키/,
  /못\s*끝냈/,
  /못\s*했어/,
  /못\s*했고/,
  /안\s*했어/,
  /안\s*했고/,
  /안\s*갈았/,
  /안\s*빨았/,
  /안\s*닦았/,
  /안\s*버렸/,
  /안\s*돌렸/,
  /안\s*시켰/,
  /안\s*끝냈/,
  /안\s*한\s*것/,
  /안\s*빨았나/,
  /아직\s*안/,
  /아직이야/,
  /아직이고/,
  /하지\s*못/,
  /하지\s*않/,
  /지\s*못했/,
  /지\s*않았/,
];

const PLANNED = [
  /거야/,
  /거야\s*$/,
  /할게/,
  /할게\s*$/,
  /시킬게/,
  /려고(?:\s|$)/,
  /예정/,
  /이따가/,
  /오늘\s*저녁에/,
  /오늘\s*밤에/,
  /내일(?!로)/,
  /모레/,
  /주말에/,
  /다음\s*주에/,
  /다음에/,
];

const UNCERTAIN = [
  /것\s*같/,
  /쯤/,
  /아마/,
  /더라/,
  /였나/,
  /했던가/,
  /지\s*싶/,
  /언제인지/,
  /기억이\s*안/,
  /모르겠어/,
];

const COMPLETED = [
  /했어/,
  /했다/,
  /해놨어/,
  /끝냈어/,
  /갈았어/,
  /빨았어/,
  /빨아놨어/,
  /버렸어/,
  /돌렸어/,
  /시켰어/,
  /닦았어/,
];

/** 조회: “언제 했어?” / “한 지 며칠?” — 불확실(더라)보다 구체 질문 우선 */
const QUERY = [
  /언제\s*했어/,
  /언제\s*했지/,
  /언제\s*했나요/,
  /언제\s*한\s*거/,
  /언제\s*야\s*\??$/,
  /언제야\s*\??$/,
  /마지막(?:으로)?\s*언제/,
  /한\s*지\s*(?:며칠|얼마)/,
  /한지\s*(?:며칠|얼마)/,
  /지\s*며칠/,
  /며칠\s*(?:됐어|됐지|이야|인가요)/,
  /며칠\s*전(?:에)?\s*(?:했어|했지)/,
  /언제\s*갈았어\s*\??$/,
  /언제\s*빨았어\s*\??$/,
];

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const hit = text.match(pattern);
    if (hit) return hit[0];
  }
  return null;
}

export function guessAction(text: string): string | null {
  let cleaned = stripPrefix(text);
  cleaned = stripIntervalPhrase(cleaned);
  cleaned = cleaned
    .replace(
      /오늘|어제|그저께|그제|그끄저께|지난주|저번\s*주|지난달|저번\s*달|지난\s*[월화수목금토일]요일|이틀\s*전|사흘\s*전|\d+\s*일\s*전|내일|모레|주말에|이따가|오늘\s*저녁에|오늘\s*밤에|다음\s*주에|다음에/g,
      " ",
    )
    .replace(
      /못\s*|아직\s*|안\s*|려고\s*|했는데|하려다|한\s*것\s*같기도\s*하고|안\s*한\s*것\s*같기도\s*해|기억이\s*안\s*나/g,
      " ",
    )
    .replace(
      /했어|했다|해놨어|끝냈어|갈았어|빨았어|빨아놨어|버렸어|돌렸어|시켰어|닦았어|거야|할게|시킬게|예정이야|려고|아직이야|던\s*것\s*같은데|더라|였나|했던가/g,
      " ",
    )
    .replace(
      /언제\s*(?:했어|했지|했나요|한\s*거|야)|마지막(?:으로)?|한\s*지|한지|며칠(?:\s*(?:됐어|됐지|이야|인가요))?|알려\s*줘|알려\s*주세요|나\s+/gu,
      " ",
    )
    .replace(/[?.!,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;
  return cleaned.replace(/(은|는|을|를|이|가|만|도)$/u, "").trim() || cleaned;
}

export function classifyUtterance(raw: string, now = new Date()): ParseResult {
  const text = stripPrefix(raw);
  const scheduleHit = extractSchedule(text);
  const schedule = scheduleHit?.schedule ?? null;
  const relative = extractRelativeDate(text, now);
  const incomplete = firstMatch(text, INCOMPLETE);
  const query = firstMatch(text, QUERY);
  const uncertain = firstMatch(text, UNCERTAIN);
  const planned = firstMatch(text, PLANNED);
  const completed = firstMatch(text, COMPLETED);
  const action = guessAction(text);

  const base = {
    action,
    date: relative?.date ?? null,
    intervalDays:
      schedule?.kind === "everyDays" ? schedule.days : null,
    schedule,
    confidence: 1,
    confidenceSource: "rule" as const,
  };

  // 조회는 부정·예정과 겹치지 않을 때 우선 (저장하지 않음)
  if (query && !incomplete && !planned) {
    // “언제 갈았더라” 류는 UNCERTAIN의 더라가 잡히면 조회가 아님
    if (uncertain && /더라|였나|했던가|것\s*같|아마|쯤/.test(text)) {
      // fall through to uncertain handling below unless query is very explicit
      if (!/언제\s*했어|한\s*지|며칠\s*(?:됐어|이야)/.test(text)) {
        // keep going
      } else {
        return {
          ...base,
          utteranceType: "query",
          provider: "utterance-rules",
          reason: `조회 표지 “${query}”`,
        };
      }
    } else {
      return {
        ...base,
        utteranceType: "query",
        provider: "utterance-rules",
        reason: `조회 표지 “${query}”`,
      };
    }
  }

  if (incomplete) {
    return {
      ...base,
      utteranceType: "incomplete",
      provider: "utterance-rules",
      reason: `부정 표지 “${incomplete}” — 완료로 저장하지 않음`,
    };
  }

  if (uncertain && !completed) {
    return {
      ...base,
      utteranceType: "uncertain",
      provider: "utterance-rules",
      reason: `불확실 표지 “${uncertain}”`,
    };
  }

  if (uncertain && completed) {
    return {
      ...base,
      utteranceType: "uncertain",
      provider: "utterance-rules",
      reason: `불확실 표지 “${uncertain}”가 완료 표현보다 우선`,
    };
  }

  const endsPlanned = /거야|할게|시킬게|려고|예정이야\s*$/.test(text);
  if (planned && (endsPlanned || !completed)) {
    return {
      ...base,
      utteranceType: "planned",
      provider: "utterance-rules",
      reason: `예정 표지 “${planned}”`,
    };
  }

  if (completed) {
    return {
      ...base,
      utteranceType: "completed",
      date: relative?.date ?? base.date,
      provider: "utterance-rules",
      reason: schedule
        ? `완료 표지 “${completed}” · 주기 포함`
        : `완료 표지 “${completed}”`,
    };
  }

  if (planned) {
    return {
      ...base,
      utteranceType: "planned",
      provider: "utterance-rules",
      reason: `예정 표지 “${planned}”`,
    };
  }

  return {
    ...base,
    utteranceType: "uncertain",
    confidence: null,
    confidenceSource: "none",
    provider: "utterance-rules",
    reason: "완료로 보기 어려워 확인이 필요합니다",
  };
}

export function skipLlm(type: UtteranceType): boolean {
  return type === "planned" || type === "incomplete" || type === "query";
}

export function negationTokensPreserved(transcript: string): boolean {
  return /못|안/.test(transcript);
}
