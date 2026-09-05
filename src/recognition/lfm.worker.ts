import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

type Generator = (
  messages: unknown,
  options?: { max_new_tokens?: number; temperature?: number },
) => Promise<unknown>;

type In =
  | { type: "load" }
  | { type: "extract"; text: string; today: string }
  | { type: "dispose" };

let generator: Generator | null = null;
let device: "webgpu" | "wasm" = "wasm";

async function load() {
  const progress = (info: { status?: string; progress?: number; file?: string }) => {
    self.postMessage({ type: "progress", info });
  };
  try {
    generator = (await pipeline(
      "text-generation",
      "onnx-community/LFM2.5-350M-ONNX",
      {
        device: "webgpu",
        dtype: "q4",
        progress_callback: progress,
      },
    )) as unknown as Generator;
    device = "webgpu";
  } catch {
    generator = (await pipeline(
      "text-generation",
      "onnx-community/LFM2.5-350M-ONNX",
      {
        device: "wasm",
        dtype: "q4",
        progress_callback: progress,
      },
    )) as unknown as Generator;
    device = "wasm";
  }
  self.postMessage({
    type: "ready",
    device,
    model: "onnx-community/LFM2.5-350M-ONNX",
  });
}

function parseJson(text: string): { action?: string; date?: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as {
      action?: string;
      date?: string;
    };
  } catch {
    return null;
  }
}

self.onmessage = async (event: MessageEvent<In>) => {
  const data = event.data;
  try {
    if (data.type === "load") {
      await load();
      return;
    }
    if (data.type === "dispose") {
      generator = null;
      self.postMessage({ type: "disposed" });
      return;
    }
    if (data.type === "extract") {
      if (!generator) await load();
      if (!generator) throw new Error("LFM 로드 실패");
      const started = Date.now();
      const messages = [
        {
          role: "system",
          content:
            "당신은 한국어 생활 기록에서 행동 이름과 날짜만 뽑습니다. JSON만 답하세요. 설명 금지.",
        },
        {
          role: "user",
          content: `오늘 날짜는 ${data.today} (한국 시간)입니다. 문장: "${data.text}"\n이 문장에서 한 일의 짧은 이름과 수행 날짜를 뽑으세요.\n{"action":"이불 빨래","date":"YYYY-MM-DD"}`,
        },
      ];
      const output = await generator(messages, {
        max_new_tokens: 64,
        temperature: 0,
      });
      const first = Array.isArray(output) ? output[0] : output;
      const generated =
        first && typeof first === "object" && "generated_text" in first
          ? first.generated_text
          : first;
      let raw = "";
      if (Array.isArray(generated)) {
        const last = generated.at(-1);
        raw = typeof last === "object" && last && "content" in last
          ? String(last.content)
          : String(last ?? "");
      } else {
        raw = String(generated ?? "");
      }
      const json = parseJson(raw);
      self.postMessage({
        type: "result",
        action: json?.action?.trim() ?? null,
        date: json?.date?.trim() ?? null,
        device,
        latencyMs: Date.now() - started,
        model: "onnx-community/LFM2.5-350M-ONNX",
        raw,
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
