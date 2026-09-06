import { useEffect, useRef, useState } from "react";
import DateField from "../components/DateField";
import IntervalChips from "../components/IntervalChips";
import MonthCalendar, { type DayPick } from "../components/MonthCalendar";
import ScheduleGauge from "../components/ScheduleGauge";
import ViewToggle from "../components/ViewToggle";
import VoiceWave from "../components/VoiceWave";
import {
  daysSince,
  formatKoreanDate,
  isOverdue,
  scheduleProgress,
  todayKst,
} from "../lib/kst";
import {
  listOverdue,
  maybeAskNotificationOnInterval,
  notifyOverdue,
  overdueSummary,
  sortRecordsForList,
} from "../lib/notify";
import type {
  InputPath,
  ParseResult,
  RecognitionDebug,
  RecordRow,
  ReminderSchedule,
  UtteranceType,
  ViewMode,
} from "../lib/types";
import {
  DEFAULT_SILENCE_MS,
  startRecorder,
  type RecorderHandle,
} from "../recognition/audio";
import { formatScheduleLabel } from "../recognition/intervals";
import {
  answerPhrase,
  matchRecords,
  missingPhrase,
  queryMatchPhrase,
} from "../recognition/lookup";
import {
  getLfmLoadError,
  parseUtterance,
  setParseProgressHandler,
} from "../recognition/parse";
import { stripPrefix } from "../recognition/prefix";
import {
  hasWebGpu,
  loadWhisper,
  setSttProgressHandler,
  transcribeBlob,
} from "../recognition/stt";
import { negationTokensPreserved } from "../recognition/utteranceRules";
import {
  cancelledPhrase,
  confirmPhrase,
  continuePhrase,
  interpretConfirmReply,
  savedPhrase,
  speak,
} from "../recognition/voice";
import {
  canRecordWhileDictating,
  canUseLiveSpeech,
  createSpeechRecognition,
  liveSpeechErrorLabel,
  recognizeOnce,
  type SpeechRecognitionHandle,
} from "../recognition/webSpeech";
import {
  deleteRecord,
  isValidPerformedOn,
  listRecords,
  normalizeActionKey,
  updateRecord,
  upsertRecord,
} from "../storage/records";

type Phase =
  | "idle"
  | "recording"
  | "transcribing"
  | "thinking"
  | "confirm"
  | "match"
  | "rejected"
  | "editing"
  | "answer"
  | "dayList"
  | "dueList"
  | "saved";

/** live = 브라우저 받아쓰기, whisper = 녹음 후 Whisper */
type CaptureMode = "live" | "whisper";

const TYPE_LABEL: Record<UtteranceType, string> = {
  completed: "완료",
  planned: "예정",
  incomplete: "미완료",
  uncertain: "확인 필요",
  query: "조회",
};

const REJECT_COPY: Record<UtteranceType, string> = {
  completed: "",
  planned: "예정으로 들려서 바로 기록하지 않았어요.",
  incomplete: "아직 하지 않은 일로 들려서 바로 기록하지 않았어요.",
  uncertain: "완료한 일로 보기 어려워 바로 기록하지 않았어요.",
  query: "",
};

const VIEW_KEY = "lastly.viewMode";

function rmsToLevel(rms: number): number {
  return Math.min(1, Math.max(0, (rms - 0.018) / 0.14));
}

function loadViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    return raw === "calendar" ? "calendar" : "list";
  } catch {
    return "list";
  }
}

export default function HomePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [textMode, setTextMode] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [raw, setRaw] = useState("");
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [editAction, setEditAction] = useState("");
  const [editDate, setEditDate] = useState(todayKst());
  const [editSchedule, setEditSchedule] = useState<ReminderSchedule | null>(
    null,
  );
  const [source, setSource] = useState<InputPath>("voice");
  const [listeningYesNo, setListeningYesNo] = useState(false);
  const [liveInterim, setLiveInterim] = useState("");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("live");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RecordRow | null>(null);
  const [toast, setToast] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [answerText, setAnswerText] = useState("");
  const [answerRow, setAnswerRow] = useState<RecordRow | null>(null);
  const [answerCandidates, setAnswerCandidates] = useState<RecordRow[]>([]);
  const [matchMode, setMatchMode] = useState<"query" | "save" | null>(null);
  const [matchRow, setMatchRow] = useState<RecordRow | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<RecordRow[]>([]);
  const [spokenAction, setSpokenAction] = useState("");
  const [dayIso, setDayIso] = useState<string | null>(null);
  const [dayPerformed, setDayPerformed] = useState<RecordRow[]>([]);
  const [dayDue, setDayDue] = useState<RecordRow[]>([]);
  const [banner, setBanner] = useState("");
  const [bannerRows, setBannerRows] = useState<RecordRow[]>([]);
  const [voiceLevel, setVoiceLevel] = useState(0);
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
  const liveRef = useRef<SpeechRecognitionHandle | null>(null);
  const liveTextRef = useRef("");
  const captureModeRef = useRef<CaptureMode>("live");
  const finishingRef = useRef(false);
  const liveStartedAt = useRef(0);
  const lastHeardAt = useRef(0);
  const silenceTimerRef = useRef(0);
  const watchdogRef = useRef(0);
  const editScheduleRef = useRef<ReminderSchedule | null>(null);
  const aliasToAddRef = useRef<string | null>(null);
  const prevScheduleRef = useRef<ReminderSchedule | null>(null);
  /** mic = Analyser, speech = 받아쓰기 조각 활동(Chrome 병행 녹음 불가 시) */
  const levelSourceRef = useRef<"none" | "mic" | "speech">("none");
  const speechLevelDecayRef = useRef(0);

  const reload = async () => {
    const next = await listRecords();
    setRows(next);
    return next;
  };

  useEffect(() => {
    void reload().then((next) => {
      const due = listOverdue(next);
      const summary = overdueSummary(next);
      if (summary && due.length > 0) {
        setBanner(summary);
        setBannerRows(due);
        notifyOverdue(next);
      }
    });
    void hasWebGpu().then((webgpu) =>
      setDebug((prev) => ({ ...prev, webgpu })),
    );
  }, []);

  useEffect(() => {
    setSttProgressHandler(setStatus);
    setParseProgressHandler(setStatus);
    return () => {
      setSttProgressHandler(null);
      setParseProgressHandler(null);
    };
  }, []);

  useEffect(() => {
    editScheduleRef.current = editSchedule;
  }, [editSchedule]);

  useEffect(() => {
    if (levelSourceRef.current !== "speech") return;
    if (voiceLevel <= 0.02) return;
    speechLevelDecayRef.current = window.setTimeout(() => {
      setVoiceLevel((prev) => Math.max(0, prev * 0.55));
    }, 120);
    return () => window.clearTimeout(speechLevelDecayRef.current);
  }, [voiceLevel]);

  const onMicLevel = (rms: number) => {
    if (levelSourceRef.current !== "mic") levelSourceRef.current = "mic";
    setVoiceLevel(rmsToLevel(rms));
  };

  const bumpSpeechLevel = () => {
    if (levelSourceRef.current === "mic") return;
    levelSourceRef.current = "speech";
    setVoiceLevel(0.72);
  };

  const changeView = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // ignore
    }
  };

  const clearVoiceTimers = () => {
    window.clearTimeout(watchdogRef.current);
    window.clearInterval(silenceTimerRef.current);
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const closeSheet = () => {
    clearVoiceTimers();
    if (liveRef.current) {
      liveRef.current.abort();
      liveRef.current = null;
    }
    if (recorderRef.current) {
      void recorderRef.current.stop();
      recorderRef.current = null;
    }
    finishingRef.current = false;
    liveTextRef.current = "";
    setPhase("idle");
    setParse(null);
    setLiveInterim("");
    setCaptureMode("live");
    captureModeRef.current = "live";
    setEditingKey(null);
    setListeningYesNo(false);
    setStatus("");
    setAnswerText("");
    setAnswerRow(null);
    setAnswerCandidates([]);
    setMatchMode(null);
    setMatchRow(null);
    setMatchCandidates([]);
    setSpokenAction("");
    aliasToAddRef.current = null;
    setDayIso(null);
    setDayPerformed([]);
    setDayDue([]);
    prevScheduleRef.current = null;
    levelSourceRef.current = "none";
    setVoiceLevel(0);
  };

  const openEdit = (row: RecordRow) => {
    if (
      phase !== "idle" &&
      phase !== "editing" &&
      phase !== "dayList" &&
      phase !== "dueList" &&
      phase !== "answer"
    ) {
      return;
    }
    setEditingKey(row.actionKey);
    setEditAction(row.actionLabel);
    setEditDate(row.lastPerformedOn);
    setEditSchedule(row.schedule ?? null);
    prevScheduleRef.current = row.schedule ?? null;
    setPhase("editing");
  };

  const actionOk = editAction.trim().length > 0;
  const dateOk = isValidPerformedOn(editDate);

  const saveEdit = async () => {
    if (!editingKey || !actionOk || !dateOk) return;
    await maybeAskNotificationOnInterval(prevScheduleRef.current, editSchedule);
    await updateRecord({
      previousKey: editingKey,
      actionLabel: editAction.trim(),
      lastPerformedOn: editDate,
      schedule: editSchedule,
    });
    setEditingKey(null);
    setPhase("idle");
    await reload();
    showToast("수정했어요");
  };

  const markDoneToday = async () => {
    if (!editingKey || !actionOk) return;
    await updateRecord({
      previousKey: editingKey,
      actionLabel: editAction.trim(),
      lastPerformedOn: todayKst(),
      schedule: editSchedule,
    });
    setEditingKey(null);
    setPhase("idle");
    await reload();
    showToast("오늘로 기록했어요");
  };

  const askDelete = (row: RecordRow) => {
    setPendingDelete(row);
  };

  const confirmDelete = async () => {
    const row = pendingDelete;
    if (!row) return;
    setPendingDelete(null);
    await deleteRecord(row.actionKey);
    if (editingKey === row.actionKey) {
      setEditingKey(null);
      setPhase("idle");
    }
    await reload();
    showToast("삭제했어요");
  };

  const save = async (
    action: string,
    date: string,
    path: InputPath,
    utterance: string,
    speakResult: boolean,
  ) => {
    const schedule = editScheduleRef.current;
    await maybeAskNotificationOnInterval(null, schedule);
    await upsertRecord({
      actionLabel: action,
      lastPerformedOn: date,
      lastUtterance: utterance,
      inputPath: path,
      schedule,
      aliasToAdd: aliasToAddRef.current,
    });
    aliasToAddRef.current = null;
    setEditAction(action);
    setEditDate(date);
    setPhase("saved");
    setListeningYesNo(false);
    await reload();
    showToast("기록했어요");
    if (speakResult) await speak(savedPhrase());
    setPhase("idle");
    setParse(null);
  };

  const cancelWithVoice = async (speakResult: boolean) => {
    if (speakResult) await speak(cancelledPhrase());
    closeSheet();
  };

  const showAnswer = async (
    phrase: string,
    path: InputPath,
    row: RecordRow | null,
    candidates: RecordRow[] = [],
  ) => {
    setAnswerText(phrase);
    setAnswerRow(row);
    setAnswerCandidates(candidates);
    setPhase("answer");
    if (path === "voice") await speak(phrase);
  };

  const runLookup = async (
    result: ParseResult,
    path: InputPath,
    currentRows: RecordRow[],
  ) => {
    const matched = matchRecords(result.action, currentRows);
    if (matched.kind === "exact") {
      await showAnswer(answerPhrase(matched.row), path, matched.row);
      return;
    }
    if (matched.kind === "similar") {
      setMatchMode("query");
      setMatchRow(matched.row);
      setMatchCandidates([]);
      setSpokenAction(result.action ?? "");
      setPhase("match");
      if (path !== "voice") return;
      setListeningYesNo(true);
      await speak(queryMatchPhrase(matched.row.actionLabel));
      try {
        const heard = await recognizeOnce({ timeoutMs: 5000 });
        const reply = interpretConfirmReply(heard, {
          action: matched.row.actionLabel,
          date: matched.row.lastPerformedOn,
        });
        if (reply.kind === "yes") {
          await showAnswer(answerPhrase(matched.row), path, matched.row);
          return;
        }
        if (reply.kind === "no") {
          await showAnswer(
            missingPhrase(result.action ?? ""),
            path,
            null,
          );
          return;
        }
      } catch {
        // 화면 버튼
      }
      setListeningYesNo(false);
      return;
    }
    if (matched.kind === "ambiguous") {
      setMatchMode("query");
      setMatchRow(null);
      setMatchCandidates(matched.candidates);
      setSpokenAction(result.action ?? "");
      await showAnswer(
        "비슷한 기록이 있어요. 화면에서 골라 주세요.",
        path,
        null,
        matched.candidates,
      );
      return;
    }
    await showAnswer(
      missingPhrase(result.action ?? ""),
      path,
      null,
    );
  };

  const askRecordConfirm = async (
    startAction: string,
    startDate: string,
    utterance: string,
    path: InputPath,
    linkedAction?: string,
  ) => {
    let action = startAction;
    let nextDate = startDate;
    setEditAction(action);
    setEditDate(nextDate);
    for (let round = 0; round < 3; round += 1) {
      const schedule = editScheduleRef.current;
      setListeningYesNo(true);
      await speak(confirmPhrase(action, nextDate, schedule));
      try {
        const heard = await recognizeOnce({ timeoutMs: 5000 });
        const reply = interpretConfirmReply(heard, { action, date: nextDate });
        if (reply.kind === "yes") {
          await save(action, nextDate, path, utterance, true);
          return;
        }
        if (reply.kind === "no") {
          await cancelWithVoice(true);
          return;
        }
        if (reply.kind === "revise") {
          action = reply.action;
          nextDate = reply.date;
          setEditAction(action);
          setEditDate(nextDate);
          if (
            linkedAction &&
            normalizeActionKey(action) !== normalizeActionKey(linkedAction)
          ) {
            aliasToAddRef.current = null;
          }
          setStatus("말로 고쳤어요. 다시 확인할게요");
          continue;
        }
      } catch {
        break;
      }
    }
    setListeningYesNo(false);
    setStatus("화면에서 고친 뒤 기록해도 돼요");
  };

  const runParse = async (
    utterance: string,
    path: InputPath,
    extras?: Partial<RecognitionDebug>,
  ) => {
    setPhase("thinking");
    setSource(path);
    setRaw(utterance);
    const result = await parseUtterance(utterance);
    setParse(result);
    setEditAction(result.action ?? utterance);
    setEditDate(result.date ?? todayKst());
    setEditSchedule(result.schedule);
    editScheduleRef.current = result.schedule;
    setDebug((prev) => ({
      ...prev,
      ...extras,
      parseProvider: result.provider,
      rawTranscript: utterance,
      loadError: getLfmLoadError(),
    }));

    if (result.utteranceType === "query") {
      const current = await reload();
      await runLookup(result, path, current);
      return;
    }

    if (result.utteranceType !== "completed") {
      setPhase("rejected");
      if (path === "voice") {
        const copy = REJECT_COPY[result.utteranceType];
        if (copy) await speak(copy);
      }
      return;
    }

    const current = await reload();
    const spoken = (result.action ?? "").trim();
    const date = result.date ?? todayKst();
    const matched = matchRecords(spoken || null, current);

    const fillFrom = (row: RecordRow | null) => {
      const action = (row?.actionLabel ?? spoken).trim();
      const sched = result.schedule ?? row?.schedule ?? null;
      setEditAction(action);
      setEditDate(date);
      setEditSchedule(sched);
      editScheduleRef.current = sched;
      setSpokenAction(spoken);
      const alias =
        row &&
        spoken &&
        normalizeActionKey(spoken) !== normalizeActionKey(row.actionLabel)
          ? spoken
          : null;
      aliasToAddRef.current = alias;
      return { action, date, sched };
    };

    if (matched.kind === "similar") {
      const filled = fillFrom(matched.row);
      setMatchMode("save");
      setMatchRow(matched.row);
      setMatchCandidates([]);
      setPhase("match");
      if (path !== "voice") return;
      setListeningYesNo(true);
      await speak(continuePhrase(filled.action, filled.date, filled.sched));
      try {
        const heard = await recognizeOnce({ timeoutMs: 5000 });
        const reply = interpretConfirmReply(heard, {
          action: filled.action,
          date: filled.date,
        });
        if (reply.kind === "yes") {
          await save(filled.action, filled.date, path, utterance, true);
          return;
        }
        if (reply.kind === "no") {
          fillFrom(null);
          setMatchMode(null);
          setMatchRow(null);
          setPhase("confirm");
          setListeningYesNo(false);
          setStatus("새 항목으로 기록할 수 있어요");
          return;
        }
      } catch {
        // 화면 버튼
      }
      setListeningYesNo(false);
      return;
    }

    if (matched.kind === "ambiguous") {
      fillFrom(null);
      setMatchMode("save");
      setMatchRow(null);
      setMatchCandidates(matched.candidates);
      setPhase("match");
      if (path === "voice") {
        await speak("비슷한 기록이 있어요. 화면에서 골라 주세요.");
      }
      return;
    }

    const filled = fillFrom(matched.kind === "exact" ? matched.row : null);
    setPhase("confirm");
    if (path !== "voice" || !filled.action) return;
    await askRecordConfirm(
      filled.action,
      filled.date,
      utterance,
      path,
      filled.action,
    );
  };

  const finishWithTranscript = async (
    spokenRaw: string,
    extras: Partial<RecognitionDebug>,
  ) => {
    const spoken = stripPrefix(spokenRaw);
    setRaw(spoken);
    setLiveInterim("");
    setDebug((prev) => ({ ...prev, ...extras, rawTranscript: spoken }));
    if (!spoken) {
      setStatus("말이 인식되지 않았어요.");
      setPhase("rejected");
      setParse(null);
      return;
    }
    await runParse(spoken, "voice", extras);
  };

  const finishVoice = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearVoiceTimers();
    const live = liveRef.current;
    const recorder = recorderRef.current;
    liveRef.current = null;
    recorderRef.current = null;
    setPhase("transcribing");
    setStatus("말을 글로 옮기는 중");
    const started = liveStartedAt.current;

    try {
      const heard = liveTextRef.current.trim();
      live?.stop();
      const blob = await recorder?.stop();

      if (heard) {
        await finishWithTranscript(heard, {
          sttProvider: "web-speech",
          sttDevice: "browser",
          sttModel: "SpeechRecognition ko-KR",
          sttLatencyMs: started ? Date.now() - started : null,
          negationPreserved: negationTokensPreserved(stripPrefix(heard)),
        });
        return;
      }

      if (!blob || blob.size === 0) {
        await finishWithTranscript("", { sttProvider: "none" });
        return;
      }

      setStatus("녹음을 글로 옮기는 중");
      const stt = await transcribeBlob(blob);
      await finishWithTranscript(stt.text, {
        sttProvider: stt.provider,
        sttDevice: stt.device,
        sttModel: stt.model,
        sttLatencyMs: stt.latencyMs,
        negationPreserved: stt.text
          ? negationTokensPreserved(stripPrefix(stt.text))
          : null,
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "인식에 실패했습니다");
      setPhase("rejected");
    } finally {
      finishingRef.current = false;
    }
  };

  const startWhisperOnly = async (note?: string) => {
    liveRef.current?.abort();
    liveRef.current = null;
    clearVoiceTimers();
    captureModeRef.current = "whisper";
    setCaptureMode("whisper");
    setLiveInterim("");
    if (recorderRef.current) {
      setPhase("recording");
      setStatus(note ?? "녹음 중");
      return;
    }
    try {
      void loadWhisper().catch(() => undefined);
      levelSourceRef.current = "mic";
      recorderRef.current = await startRecorder({
        silenceMs: DEFAULT_SILENCE_MS,
        onLevel: onMicLevel,
        onAutoStop: () => void finishVoice(),
      });
      setPhase("recording");
      setStatus(note ?? "녹음 중 · 끝내면 글로 옮겨요");
    } catch {
      setStatus("마이크 권한이 필요합니다. 주소창 왼쪽 자물쇠에서 허용해 주세요");
      setPhase("rejected");
    }
  };

  const armSilenceWatch = () => {
    window.clearInterval(silenceTimerRef.current);
    silenceTimerRef.current = window.setInterval(() => {
      if (!lastHeardAt.current) return;
      if (performance.now() - lastHeardAt.current >= DEFAULT_SILENCE_MS) {
        window.clearInterval(silenceTimerRef.current);
        void finishVoice();
      }
    }, 200);
  };

  const beginLiveDictation = () => {
    captureModeRef.current = "live";
    setCaptureMode("live");
    setPhase("recording");
    setStatus("");
    levelSourceRef.current = "speech";
    setVoiceLevel(0);

    let recorderStarted = false;
    const startFallbackRecorder = () => {
      // 받아쓰기 start와 동시에 getUserMedia를 열면 Safari 권한 창이 두 번 뜬다.
      // onstart(허용 이후)에만 병행 녹음한다.
      if (!canRecordWhileDictating() || recorderStarted || recorderRef.current) {
        return;
      }
      recorderStarted = true;
      void startRecorder({
        silenceMs: DEFAULT_SILENCE_MS,
        onLevel: onMicLevel,
        onAutoStop: () => void finishVoice(),
      })
        .then((rec) => {
          if (captureModeRef.current !== "live" || liveRef.current !== handle) {
            void rec.stop();
            return;
          }
          levelSourceRef.current = "mic";
          recorderRef.current = rec;
        })
        .catch(() => {
          recorderStarted = false;
        });
    };

    const handle = createSpeechRecognition({
      onResult: (finalText, interimText) => {
        const combined = `${finalText}${interimText}`;
        liveTextRef.current = combined;
        lastHeardAt.current = performance.now();
        setRaw(finalText);
        setLiveInterim(interimText);
        if (combined.trim()) bumpSpeechLevel();
      },
      onStart: startFallbackRecorder,
      onError: (kind) => {
        liveRef.current?.abort();
        liveRef.current = null;
        if (kind === "mic_denied") {
          setStatus(liveSpeechErrorLabel(kind));
          setPhase("rejected");
          return;
        }
        void startWhisperOnly("녹음으로 전환했어요 · 말씀해 주세요");
      },
    });

    if (!handle) {
      void startWhisperOnly("녹음으로 들을게요 · 말씀해 주세요");
      return;
    }

    liveRef.current = handle;
    handle.start();
    armSilenceWatch();
  };

  const toggleRecord = () => {
    if (phase === "transcribing" || phase === "thinking") return;
    if (phase === "recording") {
      void finishVoice();
      return;
    }

    setRaw("");
    setLiveInterim("");
    setParse(null);
    setStatus("");
    setListeningYesNo(false);
    setVoiceLevel(0);
    levelSourceRef.current = "none";
    liveTextRef.current = "";
    lastHeardAt.current = 0;
    liveStartedAt.current = Date.now();
    finishingRef.current = false;

    if (!canUseLiveSpeech()) {
      void startWhisperOnly("이 브라우저는 받아쓰기가 없어요 · 녹음으로 들을게요");
      return;
    }
    beginLiveDictation();
  };

  const startManualFromQuery = () => {
    setEditAction(parse?.action ?? editAction);
    setEditDate(todayKst());
    setEditSchedule(null);
    setSource("manual");
    setRaw(parse?.action ?? editAction);
    aliasToAddRef.current = null;
    setPhase("confirm");
  };

  const acceptQueryMatch = () => {
    if (!matchRow) return;
    void showAnswer(answerPhrase(matchRow), source, matchRow);
  };

  const rejectQueryMatch = () => {
    void showAnswer(missingPhrase(spokenAction || parse?.action || ""), source, null);
  };

  const startNewInstead = () => {
    const spoken = spokenAction || parse?.action || "";
    setEditAction(spoken);
    setEditSchedule(parse?.schedule ?? null);
    editScheduleRef.current = parse?.schedule ?? null;
    aliasToAddRef.current = null;
    setMatchMode(null);
    setMatchRow(null);
    setMatchCandidates([]);
    setPhase("confirm");
    setListeningYesNo(false);
    setStatus("새 항목으로 기록할 수 있어요");
  };

  const linkCandidate = (row: RecordRow) => {
    const spoken = spokenAction || (parse?.action ?? "").trim();
    const sched = parse?.schedule ?? row.schedule ?? null;
    setEditAction(row.actionLabel);
    setEditSchedule(sched);
    editScheduleRef.current = sched;
    aliasToAddRef.current =
      spoken &&
      normalizeActionKey(spoken) !== normalizeActionKey(row.actionLabel)
        ? spoken
        : null;
    setMatchRow(row);
    setMatchCandidates([]);
    setMatchMode("save");
    setPhase("match");
    setListeningYesNo(false);
  };

  const acceptSaveLink = () => {
    const action = (matchRow?.actionLabel ?? editAction).trim();
    if (!action) return;
    void save(action, editDate, source, raw, source === "voice");
  };

  const overlayOpen =
    phase === "recording" ||
    phase === "transcribing" ||
    phase === "thinking" ||
    phase === "confirm" ||
    phase === "match" ||
    phase === "rejected" ||
    phase === "editing" ||
    phase === "answer" ||
    phase === "dayList" ||
    phase === "dueList";

  const sortedRows = sortRecordsForList(rows);

  const overlayClose = (
    <button
      type="button"
      className="overlay-x"
      aria-label="닫기"
      onClick={closeSheet}
    >
      ×
    </button>
  );

  return (
    <div className="screen">
      <div className="apphead">
        <div className="brand">LASTLY</div>
        <h1>말만 하면 챙겨드릴게요</h1>
        <div className="sub">
          한 일을 말하면 기억해요. 언제 했는지도 물어볼 수 있어요.
        </div>
      </div>

      {banner ? (
        <div className="due-banner">
          <button
            type="button"
            className="due-banner-main"
            onClick={() => {
              if (bannerRows.length === 0) return;
              if (bannerRows.length === 1) {
                openEdit(bannerRows[0]);
                return;
              }
              setPhase("dueList");
            }}
          >
            <span>{banner}</span>
          </button>
          <button
            type="button"
            className="toast-x"
            aria-label="닫기"
            onClick={() => {
              setBanner("");
              setBannerRows([]);
            }}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="list">
        {viewMode === "list" ? (
          <>
            {sortedRows.length === 0 ? (
              <div className="empty">
                아직 기록한 일이 없어요.
                <br />
                말해 남기거나, 언제 했는지 물어볼 수 있어요.
              </div>
            ) : (
              sortedRows.map((row) => {
                const elapsed = daysSince(row.lastPerformedOn);
                const due = isOverdue(row.lastPerformedOn, row.schedule);
                const progress = scheduleProgress(
                  row.lastPerformedOn,
                  row.schedule,
                );
                return (
                  <article
                    key={row.actionKey}
                    className={`card${due ? " due" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openEdit(row);
                      }
                    }}
                  >
                    <div className="card-top">
                      <div className="card-main">
                        <div className="name">{row.actionLabel}</div>
                        <div className="last">
                          마지막 {elapsed === 0 ? "오늘" : `${elapsed}일 전`}
                          {due ? " · 알림" : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="card-delete"
                        aria-label={`${row.actionLabel} 삭제`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void askDelete(row);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 7h16" />
                          <path d="M9 7V5h6v2" />
                          <path d="M6 7l1 14h10l1-14" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </div>
                    {progress ? (
                      <ScheduleGauge
                        progress={progress}
                        schedule={row.schedule}
                      />
                    ) : null}
                  </article>
                );
              })
            )}
          </>
        ) : (
          <MonthCalendar
            rows={rows}
            onSelectDay={(pick: DayPick) => {
              setDayIso(pick.iso);
              setDayPerformed(pick.performed);
              setDayDue(pick.due);
              setPhase("dayList");
            }}
          />
        )}
      </div>

      <div className="composer">
        {textMode ? (
          <div className="composer-view-slot">
            <ViewToggle mode={viewMode} onChange={changeView} />
          </div>
        ) : null}
        <div className={`composer-row${textMode ? " text" : ""}`}>
          {!textMode ? (
            <ViewToggle mode={viewMode} onChange={changeView} />
          ) : null}
          {!textMode ? (
            <button
              type="button"
              className={`mic-btn${phase === "recording" ? " live" : ""}`}
              onClick={() => void toggleRecord()}
              aria-label="음성으로 기록하기"
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <line x1="12" y1="18" x2="12" y2="21" />
              </svg>
            </button>
          ) : (
            <form
              className="text-field on"
              onSubmit={(event) => {
                event.preventDefault();
                const next = stripPrefix(text);
                if (!next) return;
                setText("");
                setTextMode(false);
                void runParse(next, "text");
              }}
            >
              <button
                type="button"
                className="mode-switch in-field"
                onClick={() => setTextMode(false)}
                aria-label="말로 입력하기"
              >
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0" />
                  <line x1="12" y1="18" x2="12" y2="21" />
                </svg>
              </button>
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="기록하거나 언제 했는지 물어보세요"
              />
              <button type="submit" className="send" aria-label="보내기">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" />
                  <path d="M5 12l7-7 7 7" />
                </svg>
              </button>
            </form>
          )}
          {!textMode ? (
            <button
              type="button"
              className="mode-switch"
              onClick={() => setTextMode(true)}
              aria-label="글로 입력하기"
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="18" height="12" rx="2" />
                <path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8" />
              </svg>
            </button>
          ) : null}
        </div>
        {!textMode ? (
          <div className="mic-hint">
            {phase === "recording" ? "다시 눌러 끝내기" : "눌러서 말하기"}
          </div>
        ) : null}
      </div>

      {overlayOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeSheet()}>
          {overlayClose}
          <div className="sheet">
            <div className="grip" />

            {phase === "recording" && (
              <div className="voice">
                <div className="badge">
                  <span className="live-dot" />
                  {captureMode === "whisper" ? "녹음 중" : "듣고 있어요"}
                </div>
                <VoiceWave level={voiceLevel} />
                <div className={`dictation${raw || liveInterim ? "" : " placeholder"}`}>
                  {raw || liveInterim ? (
                    <>
                      {raw}
                      {raw && liveInterim ? " " : ""}
                      {liveInterim ? <span className="interim">{liveInterim}</span> : null}
                      <span className="cursor" />
                    </>
                  ) : captureMode === "whisper" ? (
                    "말씀하세요 · 끝내면 글로 바꿔요"
                  ) : (
                    "말씀하세요"
                  )}
                </div>
                <p className="sheet-tip">예: 오늘 이불 빨았어 · 설거지 언제 했어?</p>
                {status ? <p className="muted">{status}</p> : null}
                <button type="button" className="ghost" onClick={() => void toggleRecord()}>
                  말하기 끝내기
                </button>
              </div>
            )}

            {(phase === "transcribing" || phase === "thinking") && (
              <div className="thinking">
                <div className="say">
                  {phase === "transcribing"
                    ? "말을 글로 옮기고 있어요"
                    : "문장을 이해하고 있어요"}
                </div>
                <div className="quote">
                  {raw ? `“${raw}”` : status || "…"}
                </div>
                {status && raw ? <p className="muted">{status}</p> : null}
              </div>
            )}

            {phase === "match" && (
              <div className="result">
                <div className="eyebrow">비슷한 기록이 있어요</div>
                {raw ? <div className="quote">“{raw}”</div> : null}
                {matchMode === "query" && matchRow ? (
                  <>
                    <p className="say confirm-ask">
                      {queryMatchPhrase(matchRow.actionLabel)}
                    </p>
                    <div className="parsed">
                      <div className="name">{matchRow.actionLabel}</div>
                      <div className="last">
                        {formatKoreanDate(matchRow.lastPerformedOn)} ·{" "}
                        {daysSince(matchRow.lastPerformedOn) === 0
                          ? "오늘"
                          : `${daysSince(matchRow.lastPerformedOn)}일 전`}
                      </div>
                    </div>
                    {listeningYesNo ? (
                      <p className="muted listen-hint">응 · 아니</p>
                    ) : null}
                    <button
                      type="button"
                      className="confirm"
                      onClick={acceptQueryMatch}
                    >
                      맞아요
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={rejectQueryMatch}
                    >
                      아니에요
                    </button>
                  </>
                ) : null}
                {matchMode === "save" && matchRow ? (
                  <>
                    <p className="say confirm-ask">
                      {continuePhrase(
                        matchRow.actionLabel,
                        editDate,
                        editSchedule,
                      )}
                    </p>
                    <div className="parsed">
                      <label>기존 항목</label>
                      <div className="name">{matchRow.actionLabel}</div>
                      {spokenAction &&
                      normalizeActionKey(spokenAction) !==
                        normalizeActionKey(matchRow.actionLabel) ? (
                        <p className="muted">
                          “{spokenAction}”을 {matchRow.actionLabel}로 이어요
                        </p>
                      ) : null}
                      <label>날짜</label>
                      <DateField value={editDate} onChange={setEditDate} />
                      <IntervalChips
                        value={editSchedule}
                        anchorDate={editDate}
                        onChange={(next) => {
                          setEditSchedule(next);
                          editScheduleRef.current = next;
                        }}
                      />
                    </div>
                    {listeningYesNo ? (
                      <p className="muted listen-hint">응 · 아니</p>
                    ) : null}
                    <button
                      type="button"
                      className="confirm"
                      onClick={acceptSaveLink}
                    >
                      이어서 기록
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={startNewInstead}
                    >
                      새로 기록
                    </button>
                  </>
                ) : null}
                {matchMode === "save" && !matchRow && matchCandidates.length > 0 ? (
                  <>
                    <p className="say">어떤 항목에 이을까요?</p>
                    <div className="candidate-list">
                      {matchCandidates.map((row) => (
                        <button
                          key={row.actionKey}
                          type="button"
                          className="candidate"
                          onClick={() => linkCandidate(row)}
                        >
                          {row.actionLabel}
                          <span>{formatKoreanDate(row.lastPerformedOn)}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="ghost"
                      onClick={startNewInstead}
                    >
                      새로 기록
                    </button>
                  </>
                ) : null}
                <button type="button" className="ghost" onClick={closeSheet}>
                  닫기
                </button>
              </div>
            )}

            {phase === "confirm" && (
              <div className="result">
                <div className="eyebrow">이렇게 들었어요</div>
                <div className="quote">“{raw}”</div>
                <div className="parsed">
                  {parse ? (
                    <div>
                      <span className="chip">{TYPE_LABEL[parse.utteranceType]}</span>
                    </div>
                  ) : null}
                  <label>행동</label>
                  <input
                    value={editAction}
                    onChange={(event) => setEditAction(event.target.value)}
                  />
                  {spokenAction &&
                  normalizeActionKey(spokenAction) !==
                    normalizeActionKey(editAction) ? (
                    <p className="muted">
                      “{spokenAction}”을 {editAction}로 이어서 기록합니다
                    </p>
                  ) : null}
                  <label>날짜</label>
                  <DateField value={editDate} onChange={setEditDate} />
                  <IntervalChips
                    value={editSchedule}
                    anchorDate={editDate}
                    onChange={(next) => {
                      setEditSchedule(next);
                      editScheduleRef.current = next;
                    }}
                  />
                </div>
                <p className="say confirm-ask">
                  {confirmPhrase(editAction || "이 일", editDate, editSchedule)}
                </p>
                {listeningYesNo ? (
                  <p className="muted listen-hint">
                    응 · 아니 · 또는 “어제” / “시트 세탁”처럼 말해 주세요
                  </p>
                ) : null}
                <button
                  type="button"
                  className="confirm"
                  disabled={!editAction.trim()}
                  onClick={() =>
                    void save(
                      editAction.trim(),
                      editDate,
                      source,
                      raw,
                      source === "voice",
                    )
                  }
                >
                  네, 기록할게요
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void cancelWithVoice(source === "voice")}
                >
                  취소
                </button>
                <RecognitionNote debug={debug} />
              </div>
            )}

            {phase === "answer" && (
              <div className="result">
                <div className="eyebrow">조회 결과</div>
                {raw ? <div className="quote">“{raw}”</div> : null}
                <p className="say">{answerText}</p>
                {answerRow ? (
                  <div className="parsed">
                    <div className="name">{answerRow.actionLabel}</div>
                    <div className="last">
                      {formatKoreanDate(answerRow.lastPerformedOn)} ·{" "}
                      {daysSince(answerRow.lastPerformedOn) === 0
                        ? "오늘"
                        : `${daysSince(answerRow.lastPerformedOn)}일 전`}
                    </div>
                  </div>
                ) : null}
                {answerCandidates.length > 0 ? (
                  <div className="candidate-list">
                    {answerCandidates.map((row) => (
                      <button
                        key={row.actionKey}
                        type="button"
                        className="candidate"
                        onClick={() =>
                          void showAnswer(answerPhrase(row), source, row)
                        }
                      >
                        {row.actionLabel}
                        <span>{formatKoreanDate(row.lastPerformedOn)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {!answerRow && answerCandidates.length === 0 ? (
                  <button
                    type="button"
                    className="confirm"
                    onClick={startManualFromQuery}
                  >
                    지금 기록할게요
                  </button>
                ) : null}
                {answerRow ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => openEdit(answerRow)}
                  >
                    기록 수정
                  </button>
                ) : null}
                <button type="button" className="ghost" onClick={closeSheet}>
                  닫기
                </button>
              </div>
            )}

            {phase === "dayList" && dayIso && (
              <div className="result">
                <div className="eyebrow">{formatKoreanDate(dayIso)}</div>
                {dayPerformed.length === 0 && dayDue.length === 0 ? (
                  <p className="reason">이 날의 수행·예정이 없어요.</p>
                ) : null}
                {dayPerformed.length > 0 ? (
                  <>
                    <p className="day-section">수행한 일</p>
                    {dayPerformed.map((row) => (
                      <button
                        key={`p-${row.actionKey}`}
                        type="button"
                        className="candidate"
                        onClick={() => openEdit(row)}
                      >
                        {row.actionLabel}
                        <span>수행</span>
                      </button>
                    ))}
                  </>
                ) : null}
                {dayDue.length > 0 ? (
                  <>
                    <p className="day-section due-label">알림 예정</p>
                    {dayDue.map((row) => (
                      <button
                        key={`d-${row.actionKey}`}
                        type="button"
                        className="candidate candidate-due"
                        onClick={() => openEdit(row)}
                      >
                        {row.actionLabel}
                        <span>
                          {row.schedule
                            ? formatScheduleLabel(row.schedule)
                            : "예정"}
                        </span>
                      </button>
                    ))}
                  </>
                ) : null}
                <button type="button" className="ghost" onClick={closeSheet}>
                  닫기
                </button>
              </div>
            )}

            {phase === "dueList" && (
              <div className="result">
                <div className="eyebrow">주기가 지난 일</div>
                <p className="reason">
                  {bannerRows.length}건이에요. 골라서 기록하거나 수정하세요.
                </p>
                <div className="candidate-list">
                  {bannerRows.map((row) => {
                    const elapsed = daysSince(row.lastPerformedOn);
                    return (
                      <button
                        key={row.actionKey}
                        type="button"
                        className="candidate candidate-due"
                        onClick={() => openEdit(row)}
                      >
                        {row.actionLabel}
                        <span>
                          {elapsed === 0 ? "오늘" : `${elapsed}일 전`}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="ghost" onClick={closeSheet}>
                  닫기
                </button>
              </div>
            )}

            {phase === "rejected" && (
              <div className="result">
                <div className="eyebrow">이렇게 들었어요</div>
                <div className="quote">{raw ? `“${raw}”` : "인식된 말이 없어요"}</div>
                {parse && (
                  <span className="chip warn">{TYPE_LABEL[parse.utteranceType]}</span>
                )}
                <p className="reason">
                  {parse ? REJECT_COPY[parse.utteranceType] : status}
                </p>
                {raw && (
                  <div className="parsed">
                    <label>직접 고쳐 기록</label>
                    <input
                      value={editAction}
                      onChange={(event) => setEditAction(event.target.value)}
                    />
                    <label>날짜</label>
                    <DateField value={editDate} onChange={setEditDate} />
                    <IntervalChips
                      value={editSchedule}
                      anchorDate={editDate}
                      onChange={(next) => {
                        setEditSchedule(next);
                        editScheduleRef.current = next;
                      }}
                    />
                  </div>
                )}
                {raw && (
                  <button
                    type="button"
                    className="confirm"
                    disabled={!editAction.trim()}
                    onClick={() => {
                      setPhase("confirm");
                      if (source === "voice") {
                        void askRecordConfirm(
                          editAction.trim(),
                          editDate,
                          raw,
                          source,
                        );
                      }
                    }}
                  >
                    이대로 기록할게요
                  </button>
                )}
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void toggleRecord()}
                >
                  다시 말하기
                </button>
                <RecognitionNote debug={debug} />
              </div>
            )}

            {phase === "editing" && (
              <div className="result">
                <div className="eyebrow">기록 수정</div>
                <div className="parsed">
                  <label>행동</label>
                  <div className="field-row">
                    <input
                      value={editAction}
                      onChange={(event) => setEditAction(event.target.value)}
                      placeholder="예: 이불 빨래"
                    />
                    {actionOk ? <span className="ok-mark">✓</span> : null}
                  </div>
                  {!actionOk ? (
                    <p className="field-error">행동 이름을 입력해 주세요</p>
                  ) : null}
                  <label>마지막 수행일</label>
                  <DateField value={editDate} onChange={setEditDate} />
                  {!dateOk ? (
                    <p className="field-error">날짜 형식을 확인해 주세요</p>
                  ) : null}
                  <IntervalChips
                    value={editSchedule}
                    anchorDate={editDate}
                    onChange={(next) => {
                      setEditSchedule(next);
                      editScheduleRef.current = next;
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="confirm"
                  disabled={!actionOk || !dateOk}
                  onClick={() => void saveEdit()}
                >
                  저장할게요
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!actionOk}
                  onClick={() => void markDoneToday()}
                >
                  방금 했어요 · 오늘로 기록
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {pendingDelete && (
        <div
          className="modal-scrim"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPendingDelete(null);
          }}
        >
          <div className="modal-card" role="dialog" aria-labelledby="delete-title">
            <div className="modal-top">
              <h2 id="delete-title">기록을 삭제할까요?</h2>
              <button
                type="button"
                className="sheet-x"
                aria-label="닫기"
                onClick={() => setPendingDelete(null)}
              >
                ×
              </button>
            </div>
            <p className="modal-body">
              「{pendingDelete.actionLabel}」을(를) 목록에서 지워요.
            </p>
            <button
              type="button"
              className="confirm danger-fill"
              onClick={() => void confirmDelete()}
            >
              삭제할게요
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setPendingDelete(null)}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function hearingLabel(debug: RecognitionDebug): string {
  if (debug.sttProvider === "whisper-base") return "녹음을 글로 옮겼어요";
  if (debug.sttProvider === "web-speech" || debug.sttProvider === "web-speech-local") {
    return "말을 글로 받아적었어요";
  }
  if (debug.sttProvider === "none") return "말을 알아듣지 못했어요";
  return "입력한 문장을 봤어요";
}

function understandingLabel(debug: RecognitionDebug): string {
  if (debug.loadError) return "자세한 이해는 직접 확인해 주세요";
  const provider = debug.parseProvider;
  if (provider.includes("lfm") || provider.includes("llm")) {
    return "문장을 이해해 봤어요";
  }
  if (provider.includes("regex")) return "날짜를 문장에서 찾았어요";
  if (provider.includes("rule")) return "문장 규칙으로 이해했어요";
  return "내용을 확인해 주세요";
}

function RecognitionNote({ debug }: { debug: RecognitionDebug }) {
  return (
    <p className="recog-note">
      {hearingLabel(debug)} · {understandingLabel(debug)}
    </p>
  );
}
