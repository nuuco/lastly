import { env, pipeline } from "@huggingface/transformers";
import { parseIntent } from "./intent";

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

function parseJson(text: string): {
  intent?: string;
  type?: string;
  action?: string;
  date?: string;
  interval?: string | null;
} | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as {
      intent?: string;
      type?: string;
      action?: string;
      date?: string;
      interval?: string | null;
    };
  } catch {
    return null;
  }
}

function readInterval(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "null" || s === "없음" || s === "none") return null;
  return s;
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
            "한국어 생활 문장의 의도(조회/완료/예정/미완료/불확실)와 할일·날짜·주기를 JSON만으로 답하세요. 설명 금지.",
        },
        {
          role: "user",
          content: `오늘 날짜는 ${data.today} (한국 시간)입니다. 문장: "${data.text}"
intent: query=언제 했는지 물어봄, completed=한 일을 기록, planned=앞으로 할 예정, incomplete=못/안 함, uncertain=애매
action은 명사구만. 조회면 date는 null. 완료인데 날짜 없으면 오늘. 주기 없으면 interval은 null.
{"intent":"query","action":"시트 세탁","date":null,"interval":null}
{"intent":"completed","action":"빨래","date":"YYYY-MM-DD","interval":"2주마다"}`,
        },
      ];
      const output = await generator(messages, {
        max_new_tokens: 120,
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
        utteranceType: parseIntent(json?.intent ?? json?.type),
        action: json?.action?.trim() ?? null,
        date: json?.date?.trim() ?? null,
        interval: readInterval(json?.interval),
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
