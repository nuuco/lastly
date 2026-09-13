export type GemmaSlots = {
  intent: string | null;
  action: string | null;
  date: string | null;
  interval: string | null;
};

export function shiftIso(today: string, days: number): string {
  const [year, month, day] = today.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  return new Date(utc).toISOString().slice(0, 10);
}

/** 생성 중에 JSON이 닫혔는지 본다. 닫히면 그 객체를 돌려주고, 아니면 null. */
export function extractClosedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function withOpenBrace(generated: string): string {
  const trimmed = generated.trimStart();
  if (trimmed.startsWith("{")) return trimmed;
  if (/^(intent|type)":/.test(trimmed)) return `{"${trimmed}`;
  return `{${trimmed}`;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim().replace(/}+$/g, "").replace(/^"+|"+$/g, "");
  if (!text || text === "null" || text === "없음" || text === "none") {
    return null;
  }
  return text;
}

/**
 * 1B가 마지막 필드를 `"null}` 처럼 끊는 경우를 고친다.
 * 예: `"interval":"null}` → `"interval":null}`
 * 덜 나온 JSON 끝에 `}`를 붙이지는 않는다. 붙이면 생성 중에 잘린다.
 */
export function repairGemmaJson(text: string): string {
  let json = withOpenBrace(text).trim();
  json = json.replace(
    /"(intent|type|action|date|interval)"\s*:\s*"null"?(?=\s*[,}]|$)/g,
    '"$1":null',
  );
  json = json.replace(
    /"(intent|type|action|date|interval)"\s*:\s*"null}*/g,
    '"$1":null',
  );
  return json;
}

function readParsed(parsed: Record<string, unknown>, key: string): string | null {
  return emptyToNull(
    parsed[key] == null ? null : String(parsed[key]),
  );
}

export function parseGemmaSlots(raw: string): GemmaSlots | null {
  const json = extractClosedJson(repairGemmaJson(raw));
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const intent = readParsed(parsed, "intent") ?? readParsed(parsed, "type");
    const action = readParsed(parsed, "action");
    if (!intent || !action) return null;
    const planned = intent === "planned" || intent === "예정";
    return {
      intent,
      action,
      date: planned ? null : readParsed(parsed, "date"),
      interval: readParsed(parsed, "interval"),
    };
  } catch {
    return null;
  }
}

/** 생성 중단은 JSON이 닫히고 할일이 있을 때만. intent만 보이면 끊지 않는다. */
export function isGemmaJsonComplete(raw: string): boolean {
  return parseGemmaSlots(raw) != null;
}

/**
 * MediaPipe는 채팅 템플릿을 안 붙인다. Gemma 3 턴을 직접 열고
 * 모델 턴을 `{`로 시작해야 JSON이 나온다.
 * 1B는 긴 지시를 무시하고 예시를 베끼므로, 오늘/어제/조회/주기를 각각 넣는다.
 */
export function buildGemmaPrompt(text: string, today: string): string {
  const yesterday = shiftIso(today, -1);
  const user = `오늘 ${today}. JSON만 답해.
intent: query=언제 했는지, completed=했음, planned=할 예정, incomplete=못함, uncertain=애매
action은 명사구. 조회면 date는 null. 완료인데 날짜 없으면 오늘.
주기 없으면 interval은 따옴표 없이 null.

시트 세탁 언제 했지
{"intent":"query","action":"시트 세탁","date":null,"interval":null}
이불은 2주마다 빨 거야
{"intent":"planned","action":"이불 빨래","date":null,"interval":"2주마다"}
어제 빨래했어
{"intent":"completed","action":"빨래","date":"${yesterday}","interval":null}
오늘 강아지 산책했어
{"intent":"completed","action":"강아지 산책","date":"${today}","interval":null}

문장: ${text}`;
  return `<start_of_turn>user\n${user}\n<end_of_turn>\n<start_of_turn>model\n{`;
}

export function buildGemmaMatchPrompt(query: string, labels: string[]): string {
  const list = labels.map((label, i) => `${i + 1}. ${label}`).join("\n");
  const user = `할일이 기존과 같은 행위면 그 이름, 아니면 null. JSON만.
대상만 같고 일이 다르면 null (강아지 산책 ≠ 강아지 예방접종).
빨래/세탁, 이불/침구/시트는 같은 일.

할일: 강아지 산책
1. 강아지 예방접종
{"match":null}
할일: 이불 빨래
1. 시트 세탁
{"match":"시트 세탁"}

기존:
${list}
할일: ${query}`;
  return `<start_of_turn>user\n${user}\n<end_of_turn>\n<start_of_turn>model\n{`;
}

export function pickMatchLabel(raw: string, labels: string[]): string | null {
  const json = extractClosedJson(repairGemmaJson(raw));
  if (!json) return null;
  let value: unknown;
  try {
    value = (JSON.parse(json) as { match?: unknown }).match;
  } catch {
    return null;
  }
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text === "null" || text === "없음" || text === "none") return null;
  const asNum = Number(text);
  if (Number.isInteger(asNum) && String(asNum) === text) {
    return labels[asNum - 1] ?? labels[asNum] ?? null;
  }
  const key = text.replace(/\s+/g, " ");
  return labels.find((label) => label.replace(/\s+/g, " ") === key) ?? null;
}

export function isGemmaMatchComplete(raw: string): boolean {
  const json = extractClosedJson(repairGemmaJson(raw));
  if (!json) return false;
  try {
    return "match" in (JSON.parse(json) as object);
  } catch {
    return false;
  }
}
