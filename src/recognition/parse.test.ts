import { describe, expect, it } from "vitest";
import { FROZEN_NOW } from "./evalFixtures";
import { applyLfmSlots } from "./parse";
import { classifyUtterance } from "./utteranceRules";

describe("applyLfmSlots", () => {
  it("intent가 없으면 규칙 유형을 유지한다", () => {
    const raw = "빨래 어제 했고 이주마다 앞으로 하려고";
    const rules = classifyUtterance(raw, FROZEN_NOW);
    const merged = applyLfmSlots(
      raw,
      rules,
      {
        intent: null,
        action: "빨래",
        date: "2099-01-01",
        interval: "7일마다",
      },
      FROZEN_NOW,
    );
    expect(merged.utteranceType).toBe("completed");
    expect(merged.action).toBe("빨래");
    expect(merged.date).toBe(rules.date);
    expect(merged.schedule).toEqual({ kind: "everyWeeks", weeks: 2 });
  });

  it("규칙에 주기가 없으면 LFM interval을 쓴다", () => {
    const raw = "오늘 이불 빨았어";
    const rules = classifyUtterance(raw, FROZEN_NOW);
    const merged = applyLfmSlots(
      raw,
      rules,
      {
        intent: null,
        action: "이불 빨래",
        date: "2026-09-06",
        interval: "3일마다",
      },
      FROZEN_NOW,
    );
    expect(merged.action).toBe("이불 빨래");
    expect(merged.schedule).toEqual({ kind: "everyDays", days: 3 });
  });

  it("조회 의도는 LFM이 규칙을 덮는다", () => {
    const raw = "시트 세탁 언제 했는지 알려 줘";
    const rules = classifyUtterance(raw, FROZEN_NOW);
    const merged = applyLfmSlots(
      raw,
      rules,
      {
        intent: "query",
        action: "시트 세탁",
        date: null,
        interval: null,
      },
      FROZEN_NOW,
    );
    expect(merged.utteranceType).toBe("query");
    expect(merged.action).toBe("시트 세탁");
  });

  it("못/안 부정은 LFM이 완료라고 해도 미완료다", () => {
    const raw = "오늘 이불 못 빨았어";
    const rules = classifyUtterance(raw, FROZEN_NOW);
    expect(rules.utteranceType).toBe("incomplete");
    const merged = applyLfmSlots(
      raw,
      rules,
      {
        intent: "completed",
        action: "이불 빨래",
        date: "2026-09-06",
        interval: null,
      },
      FROZEN_NOW,
    );
    expect(merged.utteranceType).toBe("incomplete");
  });

  it("규칙이 완료면 LFM이 애매해도 완료를 유지한다", () => {
    const raw = "베란다 청소 오늘 함";
    const rules = classifyUtterance(raw, FROZEN_NOW);
    expect(rules.utteranceType).toBe("completed");
    const merged = applyLfmSlots(
      raw,
      rules,
      {
        intent: "uncertain",
        action: "베란다 청소",
        date: "2026-09-10",
        interval: null,
      },
      FROZEN_NOW,
    );
    expect(merged.utteranceType).toBe("completed");
  });
});
