import { describe, expect, it } from "vitest";
import {
  cancelledPhrase,
  classifyConfirm,
  confirmPhrase,
  continuePhrase,
  formatSpeakDate,
  interpretConfirmReply,
  savedPhrase,
} from "./voice";

describe("voice confirm", () => {
  it("분명한 긍정만 yes로 본다", () => {
    expect(classifyConfirm("응")).toBe("yes");
    expect(classifyConfirm("네 기록해")).toBe("yes");
    expect(classifyConfirm("아니")).toBe("no");
    expect(classifyConfirm("잘 모르겠어")).toBe("unclear");
  });

  it("행동과 날짜를 넣어 되묻는다", () => {
    const now = new Date("2026-09-06T12:00:00+09:00");
    expect(confirmPhrase("이불 빨래", "2026-09-06", null, now)).toBe(
      "이불 빨래를 오늘로 기록할까요?",
    );
    expect(confirmPhrase("이불 빨래", "2026-09-05", null, now)).toBe(
      "이불 빨래를 어제로 기록할까요?",
    );
    expect(confirmPhrase("필터", "2026-09-12", null, now)).toBe(
      "필터를 9월 12일로 기록할까요?",
    );
  });

  it("주기가 있으면 되묻기에 포함한다", () => {
    const now = new Date("2026-09-06T12:00:00+09:00");
    expect(confirmPhrase("이불 빨래", "2026-09-06", 7, now)).toBe(
      "이불 빨래를 오늘로 기록하고, 7일마다 알려줄까요?",
    );
    expect(
      confirmPhrase(
        "이불 빨래",
        "2026-09-06",
        { kind: "weekly", weekday: 5 },
        now,
      ),
    ).toBe("이불 빨래를 오늘로 기록하고, 매주 금요일에 알려줄까요?");
    expect(continuePhrase("이불 빨래", "2026-09-05", null, now)).toBe(
      "이불 빨래를 어제로 이어서 기록할까요?",
    );
  });

  it("저장·취소 결과 문구", () => {
    expect(savedPhrase()).toBe("기록했습니다.");
    expect(cancelledPhrase()).toBe("취소했어요.");
  });

  it("말 수정으로 날짜·행동을 받는다", () => {
    const now = new Date("2026-09-06T12:00:00+09:00");
    const cur = { action: "이불 빨래", date: "2026-09-06" };
    expect(interpretConfirmReply("응", cur, now)).toEqual({ kind: "yes" });
    expect(interpretConfirmReply("아니", cur, now)).toEqual({ kind: "no" });
    expect(interpretConfirmReply("어제", cur, now)).toEqual({
      kind: "revise",
      action: "이불 빨래",
      date: "2026-09-05",
    });
    expect(interpretConfirmReply("아니 시트 세탁", cur, now)).toEqual({
      kind: "revise",
      action: "시트 세탁",
      date: "2026-09-06",
    });
  });

  it("날짜를 말로 읽는다", () => {
    const now = new Date("2026-09-06T12:00:00+09:00");
    expect(formatSpeakDate("2026-09-06", now)).toBe("오늘");
    expect(formatSpeakDate("2026-09-05", now)).toBe("어제");
    expect(formatSpeakDate("2026-08-01", now)).toBe("8월 1일");
  });
});
