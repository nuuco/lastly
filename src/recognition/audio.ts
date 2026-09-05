export const DEFAULT_SILENCE_MS = 1500;

export async function blobToWhisperAudio(blob: Blob): Promise<{
  audio: Float32Array;
  sampling_rate: number;
}> {
  const buffer = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buffer.slice(0));
  const merged = mergeChannels(decoded);
  const audio = resample(merged, decoded.sampleRate, 16000);
  await ctx.close();
  return { audio, sampling_rate: 16000 };
}

function mergeChannels(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0).slice();
  }
  const length = buffer.length;
  const out = new Float32Array(length);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      out[i] += channel[i] / buffer.numberOfChannels;
    }
  }
  return out;
}

function resample(
  input: Float32Array,
  from: number,
  to: number,
): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const length = Math.round(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = src - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

export type RecorderHandle = {
  stop: () => Promise<Blob>;
};

export function startRecorder(options?: {
  silenceMs?: number;
  onLevel?: (level: number) => void;
  onAutoStop?: () => void;
}): Promise<RecorderHandle> {
  const silenceMs = options?.silenceMs ?? DEFAULT_SILENCE_MS;

  return navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "";
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start(200);

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    let heardSpeech = false;
    let quietAt: number | null = null;
    let raf = 0;
    let stopped = false;

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const v = (samples[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / samples.length);
      options?.onLevel?.(rms);
      if (rms > 0.04) {
        heardSpeech = true;
        quietAt = null;
      } else if (heardSpeech) {
        quietAt ??= performance.now();
        if (performance.now() - quietAt >= silenceMs && !stopped) {
          stopped = true;
          options?.onAutoStop?.();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const stop = () =>
      new Promise<Blob>((resolve) => {
        stopped = true;
        cancelAnimationFrame(raf);
        recorder.addEventListener(
          "stop",
          () => {
            stream.getTracks().forEach((track) => track.stop());
            void audioCtx.close();
            resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
          },
          { once: true },
        );
        if (recorder.state !== "inactive") recorder.stop();
        else {
          stream.getTracks().forEach((track) => track.stop());
          void audioCtx.close();
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        }
      });

    return { stop };
  });
}
