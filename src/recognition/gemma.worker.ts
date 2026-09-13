import { parseIntent } from "./intent";
import {
  buildGemmaMatchPrompt,
  buildGemmaPrompt,
  isGemmaJsonComplete,
  isGemmaMatchComplete,
  parseGemmaSlots,
  pickMatchLabel,
  withOpenBrace,
} from "./gemmaJson";

const GENAI_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/genai_bundle.mjs";
const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm";
const MODEL_PATH = "/models/gemma3-1b-it-int4-web.task";

type Llm = {
  generateResponse: (
    prompt: string,
    listener: (partial: string, done: boolean) => void,
  ) => Promise<string>;
  cancelProcessing: () => void;
  close: () => void;
};

type Fileset = {
  wasmLoaderPath?: string;
  wasmBinaryPath: string;
};

type In =
  | { type: "load" }
  | { type: "extract"; text: string; today: string }
  | { type: "match"; query: string; labels: string[] }
  | { type: "dispose" };

let llm: Llm | null = null;

function log(message: string) {
  self.postMessage({ type: "log", message });
}

async function loadMediaPipe() {
  const gpu = (self.navigator as Navigator & { gpu?: unknown }).gpu;
  if (!gpu) {
    throw new Error("WebGPU 없음 — MediaPipe Gemma는 Chrome GPU가 필요합니다");
  }
  log("MediaPipe ESM 로더");
  const genaiMod = (await import(/* @vite-ignore */ GENAI_CDN)) as {
    FilesetResolver: {
      forGenAiTasks: (root: string, useModule: boolean) => Promise<Fileset>;
    };
    LlmInference: {
      createFromOptions: (
        fileset: Fileset,
        options: Record<string, unknown>,
      ) => Promise<Llm>;
    };
  };
  const fileset = await genaiMod.FilesetResolver.forGenAiTasks(WASM_ROOT, true);
  const scope = self as typeof self & { ModuleFactory?: unknown };
  if (typeof scope.ModuleFactory !== "function" && fileset.wasmLoaderPath) {
    log("ModuleFactory ESM 우회");
    const loader = (await import(/* @vite-ignore */ fileset.wasmLoaderPath)) as {
      ModuleFactory?: unknown;
      default?: unknown;
    };
    scope.ModuleFactory = loader.ModuleFactory ?? loader.default;
    delete fileset.wasmLoaderPath;
  }
  const modelAssetPath = new URL(MODEL_PATH, self.location.origin).href;
  log(`모델 ${modelAssetPath}`);
  llm = await genaiMod.LlmInference.createFromOptions(fileset, {
    baseOptions: { modelAssetPath },
    maxTokens: 1280,
    topK: 40,
    temperature: 0.8,
    randomSeed: 101,
    numResponses: 1,
    forceF32: true,
  });
  self.postMessage({ type: "ready", model: "gemma3-1b-it-int4-web" });
}

async function generate(
  prompt: string,
  complete: (raw: string) => boolean,
): Promise<string> {
  if (!llm) throw new Error("Gemma가 아직 안 열렸습니다");
  let raw = "";
  let cancelled = false;
  try {
    await llm.generateResponse(prompt, (partial) => {
      raw += partial;
      if (!cancelled && complete(raw)) {
        cancelled = true;
        llm?.cancelProcessing();
      }
    });
  } catch (error) {
    if (!cancelled) throw error;
  }
  return withOpenBrace(raw);
}

self.onmessage = async (event: MessageEvent<In>) => {
  const data = event.data;
  try {
    if (data.type === "load") {
      await loadMediaPipe();
      return;
    }
    if (data.type === "dispose") {
      llm?.close();
      llm = null;
      self.postMessage({ type: "disposed" });
      return;
    }
    if (data.type === "extract") {
      const started = Date.now();
      const raw = await generate(
        buildGemmaPrompt(data.text, data.today),
        isGemmaJsonComplete,
      );
      const slots = parseGemmaSlots(raw);
      self.postMessage({
        type: "result",
        utteranceType: parseIntent(slots?.intent),
        action: slots?.action ?? null,
        date: slots?.date ?? null,
        interval: slots?.interval ?? null,
        latencyMs: Date.now() - started,
        model: "gemma3-1b-it-int4-web",
        raw,
      });
      return;
    }
    if (data.type === "match") {
      const started = Date.now();
      const raw = await generate(
        buildGemmaMatchPrompt(data.query, data.labels),
        isGemmaMatchComplete,
      );
      self.postMessage({
        type: "match-result",
        label: pickMatchLabel(raw, data.labels),
        latencyMs: Date.now() - started,
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
