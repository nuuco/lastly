import { blobToWhisperAudio } from "./audio";
import { isOnDeviceSpeechAvailable } from "./webSpeech";
import type { SttResult } from "../lib/types";

type WhisperWorkerOut =
  | { type: "ready"; device: "webgpu" | "wasm"; model: string }
  | { type: "progress"; info: { status?: string; progress?: number; file?: string } }
  | { type: "result"; text: string; device: "webgpu" | "wasm"; latencyMs: number; model: string }
  | { type: "error"; message: string }
  | { type: "disposed" };

let worker: Worker | null = null;
let loadPromise: Promise<{ device: "webgpu" | "wasm"; model: string }> | null =
  null;
let onProgress: ((label: string) => void) | null = null;

export function setSttProgressHandler(handler: ((label: string) => void) | null) {
  onProgress = handler;
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return worker;
}

export function disposeWhisper() {
  if (!worker) return;
  worker.postMessage({ type: "dispose" });
  worker.terminate();
  worker = null;
  loadPromise = null;
}

export function loadWhisper(): Promise<{ device: "webgpu" | "wasm"; model: string }> {
  if (loadPromise) return loadPromise;
  const current = getWorker();
  loadPromise = new Promise((resolve, reject) => {
    const handle = (event: MessageEvent<WhisperWorkerOut>) => {
      const data = event.data;
      if (data.type === "progress") {
        const pct = data.info.progress
          ? `${Math.round(data.info.progress)}%`
          : "";
        onProgress?.(
          `whisper-base 준비 ${data.info.file ?? ""} ${pct}`.trim(),
        );
      }
      if (data.type === "ready") {
        current.removeEventListener("message", handle);
        resolve({ device: data.device, model: data.model });
      }
      if (data.type === "error") {
        current.removeEventListener("message", handle);
        loadPromise = null;
        reject(new Error(data.message));
      }
    };
    current.addEventListener("message", handle);
    current.postMessage({ type: "load" });
  });
  return loadPromise;
}

function transcribeWithWhisper(audio: Float32Array, samplingRate: number) {
  const current = getWorker();
  return new Promise<SttResult>((resolve, reject) => {
    const handle = (event: MessageEvent<WhisperWorkerOut>) => {
      const data = event.data;
      if (data.type === "progress") {
        onProgress?.("알아듣는 중");
      }
      if (data.type === "result") {
        current.removeEventListener("message", handle);
        resolve({
          text: data.text,
          provider: "whisper-base",
          device: data.device,
          latencyMs: data.latencyMs,
          model: data.model,
        });
      }
      if (data.type === "error") {
        current.removeEventListener("message", handle);
        reject(new Error(data.message));
      }
    };
    current.addEventListener("message", handle);
    const waveform = audio instanceof Float32Array ? audio : new Float32Array(audio);
    current.postMessage(
      {
        type: "transcribe",
        audio: waveform,
        samplingRate,
      },
      [waveform.buffer],
    );
  });
}

export async function probeOnDeviceSpeech(): Promise<boolean> {
  return isOnDeviceSpeechAvailable();
}

export async function transcribeBlob(blob: Blob): Promise<SttResult> {
  onProgress?.("음성 변환 준비");
  await loadWhisper();
  const { audio, sampling_rate } = await blobToWhisperAudio(blob);
  return transcribeWithWhisper(audio, sampling_rate);
}

export async function hasWebGpu(): Promise<boolean> {
  const nav = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
  if (!nav.gpu) return false;
  try {
    return Boolean(await nav.gpu.requestAdapter());
  } catch {
    return false;
  }
}
