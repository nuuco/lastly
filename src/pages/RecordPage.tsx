import { useEffect, useMemo, useRef, useState } from "react";
import { todayKst } from "../lib/kst";
import type {
  InputPath,
  ParseResult,
  RecognitionDebug,
  UtteranceType,
} from "../lib/types";
import {
  DEFAULT_SILENCE_MS,
  startRecorder,
  type RecorderHandle,
} from "../recognition/audio";
import {
  getLfmLoadError,
  parseUtterance,
  setParseProgressHandler,
} from "../recognition/parse";
import { stripPrefix } from "../recognition/prefix";
import {
  hasWebGpu,
  probeOnDeviceSpeech,
  setSttProgressHandler,
  transcribeBlob,
} from "../recognition/stt";
import { negationTokensPreserved } from "../recognition/utteranceRules";
import { classifyConfirm, confirmPhrase, speak } from "../recognition/voice";
import { recognizeOnce } from "../recognition/webSpeech";
import { upsertRecord } from "../storage/records";

type Phase =
  | "idle"
  | "recording"
  | "working"
  | "confirm"
  | "rejected"
  | "saved";

const REJECT_COPY: Record<UtteranceType, string> = {
  completed: "",
  planned: "예정으로 들려서 기록하지 않았어요",
  incomplete: "아직 하지 않은 일로 들려서 기록하지 않았어요",
  uncertain: "언제 했는지가 분명하지 않아 기록하지 않았어요",
  query: "조회는 이 화면에서 다루지 않아요",
};

export default function RecordPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [moreOpen, setMoreOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [text, setText] = useState("");
  const [manualAction, setManualAction] = useState("");
  const [manualDate, setManualDate] = useState(todayKst());
  const [manualTouched, setManualTouched] = useState({
    action: false,
    date: false,
  });
  const [silenceMs, setSilenceMs] = useState(DEFAULT_SILENCE_MS);
  const [level, setLevel] = useState(0);
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [editAction, setEditAction] = useState("");
  const [editDate, setEditDate] = useState(todayKst());
  const [source, setSource] = useState<InputPath>("voice");
  const [raw, setRaw] = useState("");
  const [listeningYesNo, setListeningYesNo] = useState(false);
  const [onDeviceSpeech, setOnDeviceSpeech] = useState(false);
  const [debug, setDebug] = useState<RecognitionDebug>({
    webgpu: false,
    sttProvider: "-",
    sttDevice: "-",
    sttModel: "onnx-community/whisper-base",
    sttLatencyMs: null,
    parseProvider: "-",
    rawTranscript: "",
    negationPreserved: null,
    loadError: null,
  });

  const recorderRef = useRef<RecorderHandle | null>(null);
  const finishingRef = useRef(false);

  useEffect(() => {
    void hasWebGpu().then((webgpu) =>
      setDebug((prev) => ({ ...prev, webgpu })),
    );
    void probeOnDeviceSpeech().then(setOnDeviceSpeech);
  }, []);

  useEffect(() => {
    setSttProgressHandler(setStatus);
    setParseProgressHandler(setStatus);
    return () => {
      setSttProgressHandler(null);
      setParseProgressHandler(null);
    };
  }, []);

  const actionError =
    manualTouched.action && manualAction.trim().length === 0
      ? "행동 이름을 적어 주세요"
      : "";
  const dateError =
    manualTouched.date && !/^\d{4}-\d{2}-\d{2}$/.test(manualDate)
      ? "날짜 형식을 확인해 주세요"
      : "";
  const manualOk =
    manualAction.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(manualDate);

  const buttonLabel = useMemo(() => {
    if (phase === "recording") return "듣는 중 · 다시 눌러 끝내기";
    if (phase === "working") return "알아듣는 중";
    return "말하기";
  }, [phase]);

  const save = async (
    action: string,
    date: string,
    path: InputPath,
    utterance: string,
  ) => {
    await upsertRecord({
      actionLabel: action,
      lastPerformedOn: date,
      lastUtterance: utterance,
      inputPath: path,
    });
    setEditAction(action);
    setEditDate(date);
    setPhase("saved");
    setListeningYesNo(false);
  };

  const runParse = async (
    utterance: string,
    path: InputPath,
    extras?: Partial<RecognitionDebug>,
  ) => {
    setPhase("working");
    setSource(path);
    setRaw(utterance);
    const result = await parseUtterance(utterance);
    setParse(result);
    setEditAction(result.action ?? "");
    setEditDate(result.date ?? todayKst());
    setDebug((prev) => ({
      ...prev,
      ...extras,
      parseProvider: result.provider,
      rawTranscript: utterance,
      loadError: getLfmLoadError(),
    }));
    if (result.utteranceType !== "completed") {
      setPhase("rejected");
      return;
    }
    setPhase("confirm");
    if (path !== "voice" || !result.action) return;
    const phrase = confirmPhrase(result.action, result.date ?? todayKst());
    await speak(phrase);
    setListeningYesNo(true);
    try {
      const heard = await recognizeOnce({ timeoutMs: 5000 });
      const verdict = classifyConfirm(heard);
      if (verdict === "yes") {
        await save(result.action, result.date ?? todayKst(), path, utterance);
        return;
      }
      if (verdict === "no") {
        setPhase("idle");
        setParse(null);
      }
    } catch {
      // 화면 버튼으로 확정
    }
    setListeningYesNo(false);
  };

  const finishRecording = async (handle: RecorderHandle) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    recorderRef.current = null;
    setPhase("working");
    setStatus("알아듣는 중");
    try {
      const blob = await handle.stop();
      const stt = await transcribeBlob(blob);
      const spoken = stripPrefix(stt.text);
      const extras: Partial<RecognitionDebug> = {
        sttProvider: stt.provider,
        sttDevice: stt.device,
        sttModel: stt.model,
        sttLatencyMs: stt.latencyMs,
        negationPreserved: spoken ? negationTokensPreserved(spoken) : null,
      };
      setDebug((prev) => ({ ...prev, ...extras, rawTranscript: spoken }));
      if (!spoken) {
        setStatus("말이 인식되지 않았어요. 다시 말해 주세요.");
        setPhase("idle");
        return;
      }
      await runParse(spoken, "voice", extras);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "인식에 실패했습니다");
      setPhase("idle");
    } finally {
      finishingRef.current = false;
    }
  };

  const toggleRecord = async () => {
    if (phase === "working") return;
    if (phase === "recording" && recorderRef.current) {
      await finishRecording(recorderRef.current);
      return;
    }
    try {
      const handle = await startRecorder({
        silenceMs,
        onLevel: setLevel,
        onAutoStop: () => {
          if (recorderRef.current) void finishRecording(recorderRef.current);
        },
      });
      recorderRef.current = handle;
      setPhase("recording");
      setStatus("");
    } catch {
      setStatus("마이크 권한이 필요합니다");
    }
  };

  return (
    <div className="flex flex-col gap-5 pt-2">
      <p className="text-center text-[13px] text-mute">
        그냥 말해도 되고, ‘라스틀리,’를 붙여도 됩니다
      </p>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => void toggleRecord()}
          disabled={phase === "working"}
          className={`flex h-36 w-36 items-center justify-center rounded-full text-card transition ${
            phase === "recording" ? "scale-[1.02] bg-ink-soft" : "bg-ink"
          } disabled:opacity-60`}
        >
          <span className="max-w-28 text-center text-[15px] font-medium leading-snug">
            {buttonLabel}
          </span>
        </button>
        {phase === "recording" && (
          <div className="h-1 w-24 overflow-hidden rounded-full bg-line">
            <div
              className="h-full bg-ink-soft"
              style={{ width: `${Math.min(100, Math.round(level * 400))}%` }}
            />
          </div>
        )}
        {status && <p className="text-center text-sm text-mute">{status}</p>}
      </div>

      {phase === "confirm" && parse && (
        <section className="rounded-2xl border border-line bg-card p-4">
          <p className="text-[15px] font-medium text-ink">
            {confirmPhrase(
              editAction || parse.action || "이 일",
              editDate || parse.date || todayKst(),
            )}
          </p>
          {listeningYesNo && (
            <p className="mt-2 text-sm text-ink-soft">
              응 또는 아니라고 말해 주세요
            </p>
          )}
          <label className="mt-4 block text-xs text-mute">행동</label>
          <input
            className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2"
            value={editAction}
            onChange={(event) => setEditAction(event.target.value)}
          />
          <label className="mt-3 block text-xs text-mute">날짜</label>
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2"
            value={editDate}
            onChange={(event) => setEditDate(event.target.value)}
          />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-xl bg-ink py-2.5 text-sm font-medium text-card disabled:opacity-40"
              disabled={!editAction.trim()}
              onClick={() =>
                void save(editAction.trim(), editDate, source, raw)
              }
            >
              저장
            </button>
            <button
              type="button"
              className="rounded-xl border border-line py-2.5 text-sm text-mute"
              onClick={() => {
                setPhase("idle");
                setParse(null);
              }}
            >
              취소
            </button>
          </div>
        </section>
      )}

      {phase === "rejected" && parse && (
        <section className="rounded-2xl border border-line bg-card p-4">
          <p className="text-[15px] text-ink">
            {REJECT_COPY[parse.utteranceType]}
          </p>
          <p className="mt-2 text-sm text-mute">{parse.reason}</p>
          <button
            type="button"
            className="mt-4 w-full rounded-xl bg-ink py-2.5 text-sm font-medium text-card"
            onClick={() => {
              setPhase("idle");
              setParse(null);
            }}
          >
            다시 말하기
          </button>
        </section>
      )}

      {phase === "saved" && (
        <section className="rounded-2xl border border-line bg-card p-4 text-center">
          <p className="text-[15px] font-medium text-ink">기록해 두었어요</p>
          <p className="mt-1 text-sm text-mute">
            {editAction} · {editDate}
          </p>
          <button
            type="button"
            className="mt-4 text-sm text-ink-soft"
            onClick={() => setPhase("idle")}
          >
            하나 더 남기기
          </button>
        </section>
      )}

      <div>
        <button
          type="button"
          className="text-sm text-mute"
          onClick={() => setMoreOpen((value) => !value)}
        >
          {moreOpen ? "입력 닫기" : "텍스트 · 수동 입력"}
        </button>
        {moreOpen && (
          <div className="mt-3 space-y-4 rounded-2xl border border-line bg-card p-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const next = stripPrefix(text);
                if (!next) return;
                void runParse(next, "text");
                setText("");
              }}
            >
              <label className="text-xs text-mute">한 줄로 남기기</label>
              <div className="mt-1 flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2"
                  placeholder="어제 정수기 필터 갈았어"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                <button
                  type="submit"
                  className="rounded-xl bg-ink px-3 text-sm text-card"
                >
                  보내기
                </button>
              </div>
            </form>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                setManualTouched({ action: true, date: true });
                if (!manualOk) return;
                setParse({
                  utteranceType: "completed",
                  action: manualAction.trim(),
                  date: manualDate,
                  schedule: null,
                  confidence: 1,
                  confidenceSource: "none",
                  provider: "manual",
                  reason: "수동 입력",
                });
                setEditAction(manualAction.trim());
                setEditDate(manualDate);
                setSource("manual");
                setRaw(manualAction.trim());
                setPhase("confirm");
              }}
            >
              <p className="text-xs text-mute">수동 기록</p>
              <div className="relative mt-2">
                <input
                  className={`w-full rounded-xl border bg-paper px-3 py-2 pr-9 ${
                    actionError ? "border-danger" : "border-line"
                  }`}
                  placeholder="행동 이름"
                  value={manualAction}
                  onBlur={() =>
                    setManualTouched((prev) => ({ ...prev, action: true }))
                  }
                  onChange={(event) => setManualAction(event.target.value)}
                />
                {manualTouched.action && !actionError && manualAction.trim() && (
                  <span className="absolute top-2.5 right-3 text-ok">✓</span>
                )}
              </div>
              {actionError && (
                <p className="mt-1 text-xs text-danger">{actionError}</p>
              )}
              <div className="relative mt-2">
                <input
                  type="date"
                  className={`w-full rounded-xl border bg-paper px-3 py-2 ${
                    dateError ? "border-danger" : "border-line"
                  }`}
                  value={manualDate}
                  onBlur={() =>
                    setManualTouched((prev) => ({ ...prev, date: true }))
                  }
                  onChange={(event) => setManualDate(event.target.value)}
                />
                {manualTouched.date && !dateError && (
                  <span className="absolute top-2.5 right-3 text-ok">✓</span>
                )}
              </div>
              {dateError && (
                <p className="mt-1 text-xs text-danger">{dateError}</p>
              )}
              <button
                type="submit"
                className="mt-3 w-full rounded-xl border border-line py-2 text-sm"
              >
                기록
              </button>
            </form>
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          className="text-sm text-mute"
          onClick={() => setDebugOpen((value) => !value)}
        >
          {debugOpen ? "인식 패널 닫기" : "인식 패널"}
        </button>
        {debugOpen && (
          <dl className="mt-3 space-y-1 rounded-2xl border border-line bg-card p-4 text-xs text-mute">
            <Row label="WebGPU" value={debug.webgpu ? "가능" : "불가 · WASM"} />
            <Row
              label="온디바이스 Web Speech"
              value={onDeviceSpeech ? "available" : "없음"}
            />
            <Row label="STT" value={debug.sttProvider} />
            <Row label="장치" value={debug.sttDevice} />
            <Row label="모델" value={debug.sttModel} />
            <Row
              label="지연"
              value={
                debug.sttLatencyMs === null ? "-" : `${debug.sttLatencyMs}ms`
              }
            />
            <Row label="parse" value={debug.parseProvider} />
            <Row label="원문" value={debug.rawTranscript || "-"} />
            <Row
              label="못/안 보존"
              value={
                debug.negationPreserved === null
                  ? "-"
                  : debug.negationPreserved
                    ? "있음"
                    : "없음"
              }
            />
            <Row label="LFM 오류" value={debug.loadError || "-"} />
            <div className="pt-2">
              <label className="text-mute">
                무음 종료 {silenceMs / 1000}초
              </label>
              <input
                type="range"
                min={2000}
                max={5000}
                step={500}
                value={silenceMs}
                onChange={(event) => setSilenceMs(Number(event.target.value))}
                className="mt-1 w-full"
              />
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
