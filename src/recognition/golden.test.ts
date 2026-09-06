import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RecordRow } from "../lib/types";
import { normalizeActionKey } from "../storage/records";
import {
  countEvalDocRows,
  FROZEN_NOW,
  GOLDEN_FIXTURES,
  LOOKUP_SEED_LABELS,
  QUERY_FIXTURES,
  resolveDateToken,
  type EvalFixture,
} from "./evalFixtures";
import { schedulesEqual } from "./intervals";
import { matchRecords } from "./lookup";
import { classifyUtterance } from "./utteranceRules";

function axisMsg(
  fx: EvalFixture,
  axis: string,
  expected: unknown,
  actual: unknown,
) {
  return `#${fx.id} [${axis}] “${fx.text}” 기대 ${JSON.stringify(expected)} 실제 ${JSON.stringify(actual)}`;
}

function actionHits(actual: string | null, fx: EvalFixture): boolean {
  if (!actual) return false;
  const got = normalizeActionKey(actual);
  return [fx.action, ...fx.actionAliases].some(
    (label) => normalizeActionKey(label) === got,
  );
}

function seedRows(): RecordRow[] {
  return LOOKUP_SEED_LABELS.map((label) => ({
    actionKey: label,
    actionLabel: label,
    lastPerformedOn: "2026-09-01",
    lastUtterance: label,
    inputPath: "text" as const,
    schedule: null,
    aliases: [],
    updatedAt: "2026-09-06T00:00:00.000Z",
  }));
}

describe("골든셋 전수", () => {
  it("문서 표 행 수와 픽스처 길이가 같다", () => {
    expect(GOLDEN_FIXTURES.length).toBe(countEvalDocRows());
    const ids = GOLDEN_FIXTURES.map((fx) => fx.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...ids)).toBe(1);
    expect(Math.max(...ids)).toBe(GOLDEN_FIXTURES.length);
  });

  it("문서 문장이 픽스처 원문과 같다", () => {
    const md = readFileSync(
      new URL("../../docs/eval-utterances.md", import.meta.url),
      "utf8",
    );
    for (const fx of GOLDEN_FIXTURES) {
      const line = md.split("\n").find((row) =>
        new RegExp(`^\\|\\s*${fx.id}\\s*\\|`).test(row),
      );
      expect(line, `#${fx.id} 문서 행 없음`).toBeTruthy();
      const cells = line!.split("|").map((c) => c.trim());
      expect(cells[2], axisMsg(fx, "원문", fx.text, cells[2])).toBe(fx.text);
    }
  });

  it.each(GOLDEN_FIXTURES)(
    "#$id $utteranceType $text",
    (fx) => {
      const result = classifyUtterance(fx.text, FROZEN_NOW);
      expect(
        result.utteranceType,
        axisMsg(fx, "유형", fx.utteranceType, result.utteranceType),
      ).toBe(fx.utteranceType);
      expect(
        actionHits(result.action, fx),
        axisMsg(fx, "행동", [fx.action, ...fx.actionAliases], result.action),
      ).toBe(true);
      const expectedDate = resolveDateToken(fx.dateToken);
      expect(result.date, axisMsg(fx, "날짜", expectedDate, result.date)).toBe(
        expectedDate,
      );
      expect(
        schedulesEqual(result.schedule, fx.schedule),
        axisMsg(fx, "주기", fx.schedule, result.schedule),
      ).toBe(true);
    },
  );

  it.each(GOLDEN_FIXTURES)(
    "접두어 #$id $text",
    (fx) => {
      const prefixed = classifyUtterance(`라스틀리, ${fx.text}`, FROZEN_NOW);
      const plain = classifyUtterance(fx.text, FROZEN_NOW);
      expect(
        prefixed.utteranceType,
        axisMsg(fx, "접두어 유형", plain.utteranceType, prefixed.utteranceType),
      ).toBe(plain.utteranceType);
      expect(
        prefixed.action,
        axisMsg(fx, "접두어 행동", plain.action, prefixed.action),
      ).toBe(plain.action);
      expect(
        prefixed.date,
        axisMsg(fx, "접두어 날짜", plain.date, prefixed.date),
      ).toBe(plain.date);
      expect(
        schedulesEqual(prefixed.schedule, plain.schedule),
        axisMsg(fx, "접두어 주기", plain.schedule, prefixed.schedule),
      ).toBe(true);
    },
  );

  it.each(QUERY_FIXTURES)(
    "조회 매칭 #$id $text",
    (fx) => {
      const result = classifyUtterance(fx.text, FROZEN_NOW);
      expect(fx.lookupSeed, `#${fx.id} lookupSeed 없음`).toBeTruthy();
      const hit = matchRecords(result.action, seedRows());
      const matchedLabel =
        hit.kind === "exact" || hit.kind === "similar"
          ? hit.row.actionLabel
          : hit.kind === "ambiguous"
            ? hit.candidates.map((c) => c.actionLabel)
            : null;
      const ok =
        (hit.kind === "exact" || hit.kind === "similar") &&
        hit.row.actionLabel === fx.lookupSeed;
      expect(
        ok,
        axisMsg(fx, "조회매칭", fx.lookupSeed, {
          action: result.action,
          hit: hit.kind,
          matchedLabel,
        }),
      ).toBe(true);
    },
  );
});
