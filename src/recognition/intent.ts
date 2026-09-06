import type { UtteranceType } from "../lib/types";

const INTENT_ALIASES: Record<string, UtteranceType> = {
  query: "query",
  조회: "query",
  completed: "completed",
  완료: "completed",
  record: "completed",
  기록: "completed",
  planned: "planned",
  예정: "planned",
  incomplete: "incomplete",
  미완료: "incomplete",
  uncertain: "uncertain",
  불확실: "uncertain",
};

export function parseIntent(value: unknown): UtteranceType | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return INTENT_ALIASES[trimmed.toLowerCase()] ?? INTENT_ALIASES[trimmed] ?? null;
}
