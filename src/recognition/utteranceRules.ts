import type { ParseResult } from "../lib/types";
import { extractRelativeDate } from "./dates";
import { extractSchedule, stripIntervalPhrase } from "./intervals";
import { stripPrefix } from "./prefix";

const INCOMPLETE = [
  /못\s*했/,
  /못\s*갈/,
  /못\s*빨/,
  /못\s*닦/,
  /못\s*버리/,
  /못\s*버렸/,
  /아직\s*못/,
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
  /인가/,
  /언제인지/,
  /기억이\s*안/,
  /모르겠어/,
];

const COMPLETED = [
  /했고/,
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
  /언제\s*했는지/,
  /언제\s*한\s*건지/,
  /언제\s*한\s*거/,
  /언제\s*야\s*\??$/,
  /언제야\s*\??$/,
  /마지막(?:으로)?\s*언제/,
  /한\s*지\s*(?:며칠|얼마)/,
  /한지\s*(?:며칠|얼마)/,
  /지\s*며칠/,
  /며칠\s*(?:됐어|됐지(?!\s*싶어)|이야|인가요)/,
  /며칠\s*전(?:에)?\s*(?:했어|했지)/,
  /언제\s*갈았어\s*\??$/,
  /언제\s*빨았어\s*\??$/,
  /언제.{0,24}알려\s*(?:줘|주세요)/,
];

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const hit = text.match(pattern);
    if (hit) return hit[0];
  }
  return null;
}

const ACTION_FROM_STEM: Record<string, string> = {
  이불: "이불 빨래",
  커튼: "커튼 빨래",
  베개: "베개 빨래",
  빨: "빨래",
};

const ACTION_DROP = new Set([
  "밤",
  "아침",
  "저녁",
  "갈",
  "하",
  "하지",
  "했는데",
  "싶어",
  "게",
  "였",
  "지",
  "간",
  "정확히",
  "인지",
  "해",
  "나",
  "이었나",
  "꽤",
  "된",
  "언제",
  "다시",
  "한",
  "했고",
  "앞으로",
]);

function finalizeAction(raw: string): string | null {
  const tokens = raw
    .replace(/[?.!,]/g, " ")
    .split(/\s+/)
    .map((token) =>
      token
        .replace(/시킨$/u, "")
        .replace(/한$/u, "")
        .replace(/청소하$/u, "청소")
        .replace(/(은|는|을|를|이|가|만|도|에|의|게)$/u, ""),
    )
    .map((token) => {
      if (/빨$/u.test(token) && token !== "빨래") {
        return token.replace(/빨$/u, "").trim() || "빨래";
      }
      return token.replace(
        /(?:돌릴|돌린|돌리다|갈아끼운|갈았|바꿀|버릴)$/u,
        "",
      );
    })
    .map((token) => token.trim())
    .filter((token) => token && !ACTION_DROP.has(token));

  const collapsed: string[] = [];
  for (const token of tokens) {
    if (collapsed.at(-1) !== token) collapsed.push(token);
  }
  let s = collapsed.join(" ").trim();
  s = s.replace(/\s*하$/u, "").trim();
  if (ACTION_FROM_STEM[s]) return ACTION_FROM_STEM[s];
  const last = collapsed.at(-1);
  if (last && ACTION_FROM_STEM[last] && collapsed.length === 1) {
    return ACTION_FROM_STEM[last];
  }
  if (collapsed.length === 1 && collapsed[0] === "빨래") return "빨래";
  if (collapsed[0] && ACTION_FROM_STEM[collapsed[0]] && collapsed.length <= 2) {
    if (collapsed.length === 1) return ACTION_FROM_STEM[collapsed[0]];
  }
  return s || null;
}

export function guessAction(text: string): string | null {
  let cleaned = stripPrefix(text);
  cleaned = stripIntervalPhrase(cleaned);

  const onlyDone = cleaned.match(
    /([가-힣]+)\s*만\s*(?:빨았|갈았|닦았|했|끝냈|버렸)/u,
  );
  if (onlyDone) return finalizeAction(onlyDone[1]);

  const notDone = cleaned.match(
    /([가-힣]+)\s*(?:은|는)?\s*(?:못|안)\s/u,
  );
  if (
    notDone &&
    /는데|해도|했고|했어도/.test(cleaned) &&
    !/했/u.test(notDone[1])
  ) {
    return finalizeAction(notDone[1]);
  }

  cleaned = cleaned
    .replace(
      /오늘|어제|그저께|그제|그끄저께|그그제|지난주|저번\s*주|지난달|저번\s*달|지난\s*[월화수목금토일]요일|이틀\s*전|사흘\s*전|\d+\s*일\s*전|내일(?:로)?|모레|주말에|이따가|다음\s*주에|다음에/g,
      " ",
    )
    .replace(/아침|저녁에|저녁|밤/g, " ")
    .replace(/마다/g, " ")
    .replace(/알려\s*줘|알려\s*주세요|알림/g, " ")
    .replace(
      /언제\s*(?:했어|했지|했나요|했는지|한\s*건지|한\s*거|야|갈았어|빨았어)?|언제였/g,
      " ",
    )
    .replace(/했는지|한\s*건지/g, " ")
    .replace(/마지막(?:으로)?(?:에)?/g, " ")
    .replace(/한\s*지|한지|지가|(?:^|\s)지(?:\s|$)/g, " ")
    .replace(/며칠(?:\s*(?:됐어|됐지|이야|인가요))?/g, " ")
    .replace(/얼마야|꽤\s*된|지\s*싶(?:어)?|싶어/g, " ")
    .replace(/(?:^|\s)나\s+/g, " ")
    .replace(/끝낸\s*줄\s*알았는데|나중에\s*하고|그대로\s+두고|안\s+건드리고/g, " ")
    .replace(/하려고\s*했는데|하려다|하려고|했는데|앞으로(?:는)?/g, " ")
    .replace(/한\s*것\s*같기도\s*하고|안\s*한\s*것\s*같기도\s*해/g, " ")
    .replace(/것\s*같(?:은데|아|기도)?/g, " ")
    .replace(/기억이\s*안\s*나|모르겠어|정확히\s*언제인지/g, " ")
    .replace(/아마|쯤|던\s*것\s*같은데|더라|였나|했던가|인가|이었나/g, " ")
    .replace(/못\s*|아직(?:이야|이고)?\s*|안\s*/g, " ")
    .replace(
      /했어도|했고|했어|했다|해놨어|끝냈어|갈았어|빨았어|빨아놨어|버렸어|돌렸어|시켰어|닦았어/g,
      " ",
    )
    .replace(
      /거야|버릴게|할게|시킬게|예정이야|려고|다시|시켰/g,
      " ",
    )
    .replace(/빨았던|빨았나|갈았던|버린|돌린|간\s*것/g, " ")
    .replace(/빨려고/g, " 빨래 ")
    .replace(/[?.!,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return finalizeAction(cleaned);
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
    schedule,
    confidence: 1,
    confidenceSource: "rule" as const,
  };

  const hedgeUncertain =
    /더라|였나|했던가|것\s*같|아마|쯤|지\s*싶|인가|기억이\s*안/.test(text);

  // 조회는 부정·예정과 겹치지 않을 때 우선. “더라/싶어” 류는 불확실
  if (query && !incomplete && !planned) {
    if (uncertain && hedgeUncertain && !/언제\s*했(?:어|는지)|한\s*지\s*(?:며칠|얼마)/.test(text)) {
      // fall through
    } else {
      return {
        ...base,
        utteranceType: "query",
        provider: "utterance-rules",
        reason: `조회 표지 “${query}”`,
      };
    }
  }

  const softYet = Boolean(incomplete && /아직이고|아직이야/.test(incomplete));
  const hedgedNegation =
    Boolean(incomplete && uncertain) &&
    /안\s*한\s*것|안\s*빨았/.test(incomplete ?? "") &&
    /것\s*같|기억이\s*안|빨았나/.test(text);

  if (incomplete && !(softYet && planned) && !hedgedNegation) {
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

  // 완료 동사가 있으면 “앞으로 하려고”는 주기로 보고 완료로 저장
  if (planned && !completed) {
    return {
      ...base,
      utteranceType: "planned",
      date: null,
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

  return {
    ...base,
    utteranceType: "uncertain",
    confidence: null,
    confidenceSource: "none",
    provider: "utterance-rules",
    reason: "완료로 보기 어려워 확인이 필요합니다",
  };
}

export function negationTokensPreserved(transcript: string): boolean {
  return /못|안/.test(transcript);
}
