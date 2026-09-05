import type { RecordRow } from "../lib/types";
import { daysSince } from "../lib/kst";
import { formatSpeakDate } from "./voice";
import { normalizeActionKey } from "../storage/records";

export type LookupMatch =
  | { kind: "exact" | "partial"; row: RecordRow }
  | { kind: "ambiguous"; candidates: RecordRow[] }
  | { kind: "none"; query: string };

function score(query: string, row: RecordRow): number {
  const q = normalizeActionKey(query).toLowerCase();
  const key = row.actionKey.toLowerCase();
  const label = row.actionLabel.toLowerCase();
  if (!q) return 0;
  if (key === q || label === q) return 100;
  if (key.includes(q) || label.includes(q)) return 70 + Math.min(20, q.length);
  if (q.includes(key) || q.includes(label)) return 55;
  // 글자 겹침 비율
  const setQ = new Set(q.replace(/\s/g, ""));
  const setL = new Set(label.replace(/\s/g, ""));
  let overlap = 0;
  for (const ch of setQ) if (setL.has(ch)) overlap += 1;
  const ratio = overlap / Math.max(setQ.size, 1);
  return ratio >= 0.5 ? Math.round(ratio * 40) : 0;
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
  const close = ranked.filter((x) => x.s >= top.s - 15 && x.s >= 40);

  if (top.s >= 100) return { kind: "exact", row: top.row };
  if (close.length >= 2 && close[0].s < 90) {
    return {
      kind: "ambiguous",
      candidates: close.slice(0, 3).map((x) => x.row),
    };
  }
  if (top.s >= 40) {
    return { kind: top.s >= 70 ? "exact" : "partial", row: top.row };
  }
  return { kind: "none", query: q };
}

export function answerPhrase(row: RecordRow, now = new Date()): string {
  const when = formatSpeakDate(row.lastPerformedOn, now);
  const elapsed = daysSince(row.lastPerformedOn, now);
  const elapsedLabel =
    elapsed === 0 ? "오늘 했어요." : `${elapsed}일 지났어요.`;
  return `${row.actionLabel}은/는 ${when}에 했어요. ${elapsedLabel}`;
}

export function missingPhrase(query: string): string {
  const label = query.trim() || "그 일";
  return `${label}에 대한 기록이 아직 없어요. 지금 기록할까요?`;
}
