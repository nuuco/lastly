import { describe, expect, it } from "vitest";
import { advanceAndroidTranscript, mergeTranscripts } from "./webSpeech";

describe("mergeTranscripts", () => {
  it("겹치는 부분을 두 번 쓰지 않는다", () => {
    expect(mergeTranscripts("어제 이불", "어제 이불 빨았어")).toBe(
      "어제 이불 빨았어",
    );
    expect(mergeTranscripts("어제 이불 빨았어", "어제 이불")).toBe(
      "어제 이불 빨았어",
    );
  });

  it("이어지는 말은 띄어쓰기로 붙인다", () => {
    expect(mergeTranscripts("어제 이불", "빨았어")).toBe("어제 이불 빨았어");
  });
});

describe("advanceAndroidTranscript", () => {
  it("같은 문장이 다시 오면 무시한다", () => {
    expect(advanceAndroidTranscript("이불 빨았어", "이불 빨았어")).toBeNull();
    expect(advanceAndroidTranscript("이불 빨았어", "이불")).toBeNull();
  });

  it("길어진 문장만 받는다", () => {
    expect(advanceAndroidTranscript("이불", "이불 빨았어")).toBe("이불 빨았어");
  });
});
