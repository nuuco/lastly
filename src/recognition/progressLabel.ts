export type ModelLoadInfo = {
  status?: string;
  progress?: number;
  file?: string;
};

function percent(info: ModelLoadInfo): number | null {
  const n = info.progress;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const pct = Math.round(n);
  if (pct <= 0 || pct >= 100) return null;
  return pct;
}

function withPercent(base: string, info: ModelLoadInfo): string {
  const pct = percent(info);
  if (pct == null || pct >= 100) return base;
  return `${base} · ${pct}%`;
}

/** 이해 모델(LFM) 첫 다운로드. 파일명·모델명은 보여 주지 않음 */
export function understandLoadLabel(info: ModelLoadInfo): string {
  return withPercent("이해할 준비를 하고 있어요", info);
}

/** 받아쓰기 모델(Whisper) 첫 다운로드 */
export function transcribeLoadLabel(info: ModelLoadInfo): string {
  return withPercent("받아쓰기 준비를 하고 있어요", info);
}
