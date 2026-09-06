import type { RecordRow } from "../lib/types";
import { daysSince } from "../lib/kst";
import { formatSpeakDate, topicParticle } from "./voice";
import { normalizeActionKey } from "../storage/records";

export type LookupMatch =
  | { kind: "exact"; row: RecordRow }
  | { kind: "similar"; row: RecordRow }
  | { kind: "ambiguous"; candidates: RecordRow[] }
  | { kind: "none"; query: string };

/** 비교용 동의어. 저장 키는 바꾸지 않고, 비슷한지 볼 때만 씀 */
const SYN_GROUPS: string[][] = [
  ["빨래", "세탁"],
  ["이불", "침구", "시트"],
];

const SYN_CANON = new Map<string, string>();
for (const group of SYN_GROUPS) {
  const canon = group[0];
  for (const word of group) SYN_CANON.set(word, canon);
}

/** 대상이 다른데 동사만 같은 경우(에어컨 청소 vs 화장실 청소)는 비슷하다고 보지 않음 */
const GENERIC_TOKENS = new Set(["청소", "빨래", "세탁", "교체"]);

function tokens(text: string): string[] {
  return normalizeActionKey(text)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function canonToken(token: string): string {
  return SYN_CANON.get(token) ?? token;
}

function canonSet(text: string): Set<string> {
  return new Set(tokens(text).map(canonToken));
}

function distinctive(set: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const token of set) {
    if (!GENERIC_TOKENS.has(token)) out.add(token);
  }
  return out;
}

function namesOf(row: RecordRow): string[] {
  return [row.actionKey, row.actionLabel, ...(row.aliases ?? [])];
}

function scoreAgainst(query: string, name: string): number {
  const q = normalizeActionKey(query).toLowerCase();
  const n = normalizeActionKey(name).toLowerCase();
  if (!q || !n) return 0;
  if (q === n) return 100;

  const setQ = canonSet(q);
  const setN = canonSet(n);
  if (setQ.size > 0 && setN.size > 0) {
    const distQ = distinctive(setQ);
    const distN = distinctive(setN);
    if (distQ.size > 0 && distN.size > 0) {
      let distShared = 0;
      for (const token of distQ) if (distN.has(token)) distShared += 1;
      if (distShared === 0) return 0;
    }
    const same =
      setQ.size === setN.size && [...setQ].every((t) => setN.has(t));
    if (same) return 88;
    const subset =
      [...setQ].every((t) => setN.has(t)) ||
      [...setN].every((t) => setQ.has(t));
    if (subset) return 75;
    let shared = 0;
    for (const t of setQ) if (setN.has(t)) shared += 1;
    if (shared > 0) return 60 + Math.min(20, shared * 8);
  }

  if (n.includes(q) || q.includes(n)) return 70 + Math.min(20, q.length);

  const charsQ = new Set(q.replace(/\s/g, ""));
  const charsN = new Set(n.replace(/\s/g, ""));
  let overlap = 0;
  for (const ch of charsQ) if (charsN.has(ch)) overlap += 1;
  const ratio = overlap / Math.max(charsQ.size, 1);
  return ratio >= 0.5 ? Math.round(ratio * 40) : 0;
}

function score(query: string, row: RecordRow): number {
  let best = 0;
  for (const name of namesOf(row)) {
    best = Math.max(best, scoreAgainst(query, name));
  }
  return best;
}

export function matchRecords(
  query: string | null,
  rows: RecordRow[],
): LookupMatch {
  const q = (query ?? "").trim();
  if (!q) return { kind: "none", query: "" };

  const ranked = rows
    .map((row) => ({ row, s: score(q, row) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  if (ranked.length === 0) return { kind: "none", query: q };

  const top = ranked[0];
  const close = ranked.filter((x) => x.s >= top.s - 15 && x.s >= 55);

  if (top.s >= 100) return { kind: "exact", row: top.row };
  if (close.length >= 2) {
    return {
      kind: "ambiguous",
      candidates: close.slice(0, 3).map((x) => x.row),
    };
  }
  if (top.s >= 55) return { kind: "similar", row: top.row };
  return { kind: "none", query: q };
}

export function answerPhrase(row: RecordRow, now = new Date()): string {
  const when = formatSpeakDate(row.lastPerformedOn, now);
  const elapsed = daysSince(row.lastPerformedOn, now);
  const topic = `${row.actionLabel}${topicParticle(row.actionLabel)}`;
  if (when === "오늘") return `${topic} 오늘 했어요.`;
  if (when === "어제") return `${topic} 어제 했어요.`;
  if (when === "그저께") return `${topic} 그저께 했어요.`;
  return `${topic} ${when}에 했어요. ${elapsed}일 지났어요.`;
}

export function missingPhrase(query: string): string {
  const label = query.trim() || "그 일";
  return `${label}에 대한 기록이 아직 없어요. 지금 기록할까요?`;
}

export function queryMatchPhrase(label: string): string {
  return `${label} 말한 거 맞아요?`;
}
