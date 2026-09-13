import { env, pipeline } from "@huggingface/transformers";
import { hasWebGpu, ortDeviceOrder, type OrtDevice } from "./ortDevice";
import { pinOrtWasm, probeOrtRuntime } from "./pinOrtWasm";

env.allowLocalModels = false;
env.useBrowserCache = true;
pinOrtWasm();

type Transcriber = (
  audio: Float32Array,
  options?: { language?: string; task?: string },
) => Promise<unknown>;

function toWaveform(input: Float32Array | ArrayLike<number>): Float32Array {
  return input instanceof Float32Array ? input : new Float32Array(input);
}

type In =
  | { type: "load" }
  | { type: "transcribe"; audio: Float32Array; samplingRate: number }
  | { type: "dispose" };

let transcriber: Transcriber | null = null;
let device: OrtDevice = "wasm";

async function load() {
  const progress = (info: {
    status?: string;
    progress?: number;
    file?: string;
  }) => {
    self.postMessage({ type: "progress", info });
  };
  await probeOrtRuntime();
  const order = ortDeviceOrder(
    self.navigator?.userAgent ?? "",
    hasWebGpu((self.navigator as { gpu?: unknown } | undefined)?.gpu),
  );
  let lastError: unknown;
  for (const next of order) {
    try {
      if (next === "webgpu") {
        transcriber = (await pipeline(
          "automatic-speech-recognition",
          "onnx-community/whisper-base",
          {
            device: "webgpu",
            dtype: {
              encoder_model: "fp16",
              decoder_model_merged: "q4",
            },
            progress_callback: progress,
          },
        )) as unknown as Transcriber;
      } else {
        transcriber = (await pipeline(
          "automatic-speech-recognition",
          "onnx-community/whisper-base",
          {
            device: "wasm",
            dtype: "q8",
            progress_callback: progress,
          },
        )) as unknown as Transcriber;
      }
      device = next;
      self.postMessage({
        type: "ready",
        device,
        model: "onnx-community/whisper-base",
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "Whisper 로드 실패"));
}

self.onmessage = async (event: MessageEvent<In>) => {
  const data = event.data;
  try {
    if (data.type === "load") {
      await load();
      return;
    }
    if (data.type === "dispose") {
      transcriber = null;
      self.postMessage({ type: "disposed" });
      return;
    }
    if (data.type === "transcribe") {
      if (!transcriber) await load();
      if (!transcriber) throw new Error("whisper 로드 실패");
      const started = Date.now();
      const output = await transcriber(toWaveform(data.audio), {
        language: "korean",
        task: "transcribe",
      });
      const text =
        typeof output === "object" && output && "text" in output
          ? String((output as { text: string }).text)
          : String(output);
      self.postMessage({
        type: "result",
        text: text.trim(),
        device,
        latencyMs: Date.now() - started,
        model: "onnx-community/whisper-base",
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
