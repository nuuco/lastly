import { describe, expect, it } from "vitest";
import {
  buildGemmaMatchPrompt,
  buildGemmaPrompt,
  extractClosedJson,
  isGemmaJsonComplete,
  isGemmaMatchComplete,
  parseGemmaSlots,
  pickMatchLabel,
  shiftIso,
  withOpenBrace,
} from "./gemmaJson";

describe("gemmaJson", () => {
  it("오늘에서 어제 날짜를 뺀다", () => {
    expect(shiftIso("2026-09-14", -1)).toBe("2026-09-13");
  });

  it("닫힌 JSON만 잘라 낸다", () => {
    expect(extractClosedJson('x {"a":1} extra')).toBe('{"a":1}');
    expect(extractClosedJson('{"a":')).toBeNull();
    expect(extractClosedJson('{"a":"{ok}"}')).toBe('{"a":"{ok}"}');
  });

  it("모델 턴 앞의 {를 보정한다", () => {
    expect(withOpenBrace('"intent":"query"}')).toBe('{"intent":"query"}');
    expect(withOpenBrace('{"intent":"query"}')).toBe('{"intent":"query"}');
  });

  it("슬롯 JSON을 읽는다", () => {
    expect(
      parseGemmaSlots(
        '{"intent":"completed","action":"빨래","date":"2026-09-13","interval":null}',
      ),
    ).toEqual({
      intent: "completed",
      action: "빨래",
      date: "2026-09-13",
      interval: null,
    });
  });

  it("1B가 interval을 \"null} 로 끊어도 슬롯을 읽는다", () => {
    expect(
      parseGemmaSlots(
        '{"intent":"completed","action":"강아지 산책","date":"2026-09-14","interval":"null}',
      ),
    ).toEqual({
      intent: "completed",
      action: "강아지 산책",
      date: "2026-09-14",
      interval: null,
    });
    expect(
      parseGemmaSlots(
        '{"intent":"completed","action":"강아지 산책","date":"2026-09-13","interval":"null}"',
      ),
    ).toEqual({
      intent: "completed",
      action: "강아지 산책",
      date: "2026-09-13",
      interval: null,
    });
  });

  it("intent만 나온 중간 생성은 완성으로 보지 않는다", () => {
    expect(isGemmaJsonComplete('{"intent":"completed')).toBe(false);
    expect(isGemmaJsonComplete('{"intent":"query')).toBe(false);
    expect(isGemmaJsonComplete('{intent":"completed","action":"빨래","')).toBe(
      false,
    );
    expect(parseGemmaSlots('{"intent":"completed')).toBeNull();
  });

  it("예정은 문장에 날짜가 없어도 예시 날짜를 붙이지 않는다", () => {
    expect(
      parseGemmaSlots(
        '{"intent":"planned","action":"이불 빨래","date":"2026-09-13","interval":"2주마다"}',
      ),
    ).toEqual({
      intent: "planned",
      action: "이불 빨래",
      date: null,
      interval: "2주마다",
    });
  });

  it("모델이 { 다음 따옴표를 빼도 연다", () => {
    expect(withOpenBrace('intent":"completed","action":"빨래"}')).toBe(
      '{"intent":"completed","action":"빨래"}',
    );
  });

  it("Gemma 턴과 오늘·어제 예시를 붙인다", () => {
    const prompt = buildGemmaPrompt("어제 빨래했어", "2026-09-14");
    expect(prompt).toContain("<start_of_turn>user");
    expect(prompt).toContain("<start_of_turn>model\n{");
    expect(prompt).toContain('"date":"2026-09-13"');
    expect(prompt).toContain('"date":"2026-09-14"');
    expect(prompt).toContain("시트 세탁 언제 했지");
  });

  it("닫힌 match JSON만 완성으로 본다", () => {
    expect(isGemmaMatchComplete('{"match":null}')).toBe(true);
    expect(isGemmaMatchComplete('{"match":"이불 빨래"}')).toBe(true);
    expect(isGemmaMatchComplete('{"match":')).toBe(false);
  });

  it("매칭 라벨을 고른다", () => {
    const labels = ["시트 세탁", "강아지 산책"];
    expect(pickMatchLabel('{"match":"시트 세탁"}', labels)).toBe("시트 세탁");
    expect(pickMatchLabel('{"match":null}', labels)).toBeNull();
    expect(pickMatchLabel('{"match":1}', labels)).toBe("시트 세탁");
  });

  it("Gemma 매칭 턴을 붙인다", () => {
    const prompt = buildGemmaMatchPrompt("빨래", ["이불 빨래"]);
    expect(prompt).toContain("<start_of_turn>model\n{");
    expect(prompt).toContain("1. 이불 빨래");
  });
});
