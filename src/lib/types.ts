export type UtteranceType =
  | "completed"
  | "planned"
  | "incomplete"
  | "uncertain"
  | "query";

export type InputPath = "voice" | "text" | "manual";

export type ConfidenceSource = "rule" | "regex" | "llm" | "none";

/** 0=일 … 6=토 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 1~4=몇째 주, -1=마지막 */
export type MonthWeekOrdinal = 1 | 2 | 3 | 4 | -1;

export type NormalizedReminderSchedule =
  | { kind: "everyDays"; days: number }
  | { kind: "everyWeeks"; weeks: number }
  | { kind: "everyMonths"; months: number }
  | { kind: "everyYears"; years: number }
  | { kind: "weekly"; weekday: Weekday }
  | { kind: "monthlyDay"; day: number }
  | { kind: "monthlyNthWeekday"; nth: MonthWeekOrdinal; weekday: Weekday };

export type ReminderSchedule =
  | NormalizedReminderSchedule
  /** @deprecated monthlyNthWeekday nth:-1 로 정규화 */
  | { kind: "monthlyLast"; weekday: Weekday };

export type ParseResult = {
  utteranceType: UtteranceType;
  action: string | null;
  date: string | null;
  schedule: ReminderSchedule | null;
  confidence: number | null;
  confidenceSource: ConfidenceSource;
  provider: string;
  reason: string;
};

export type RecordRow = {
  actionKey: string;
  actionLabel: string;
  lastPerformedOn: string;
  lastUtterance: string;
  inputPath: InputPath;
  schedule: ReminderSchedule | null;
  /** 같은 항목으로 확인된 다른 호칭 */
  aliases: string[];
  updatedAt: string;
};

export type SttProvider =
  | "whisper-base"
  | "web-speech"
  | "web-speech-local"
  | "none";

export type SttResult = {
  text: string;
  provider: SttProvider;
  device: "webgpu" | "wasm" | "browser";
  latencyMs: number;
  model: string;
};

export type RecognitionDebug = {
  webgpu: boolean;
  sttProvider: string;
  sttDevice: string;
  sttModel: string;
  sttLatencyMs: number | null;
  parseProvider: string;
  rawTranscript: string;
  negationPreserved: boolean | null;
  loadError: string | null;
};

export type ViewMode = "list" | "calendar";
