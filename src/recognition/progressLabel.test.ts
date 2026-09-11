import { describe, expect, it } from "vitest";
import { transcribeLoadLabel, understandLoadLabel } from "./progressLabel";

describe("progressLabel", () => {
  it("파일명·모델명을 넣지 않는다", () => {
    expect(
      understandLoadLabel({
        file: "onnx/model_q4.onnx_data",
        progress: 42,
      }),
    ).toBe("이해할 준비를 하고 있어요 · 42%");
    expect(
      transcribeLoadLabel({
        file: "onnx/decoder_model_merged.onnx",
        progress: 12,
      }),
    ).toBe("받아쓰기 준비를 하고 있어요 · 12%");
  });

  it("진행률이 없거나 끝나면 퍼센트를 생략한다", () => {
    expect(understandLoadLabel({ file: "onnx/model_q4.onnx_data" })).toBe(
      "이해할 준비를 하고 있어요",
    );
    expect(transcribeLoadLabel({ progress: 100 })).toBe(
      "받아쓰기 준비를 하고 있어요",
    );
  });
});
