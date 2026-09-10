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
  /** 목록·알림 부제. 빈 문자열 허용 */
  memo: string;
  /** 쉬어가기. 그날까지 지남·오늘예정·알림함에서 뺌 */
  snoozeUntil: string | null;
  updatedAt: string;
};

/** 주기가 있는 항목의 기한 상태. 주기 없으면 null */
export type DueKind = "late" | "soon" | "ok";

export type DueInfo = {
  kind: DueKind;
  dueOn: string;
  /** 오늘 기준: 음수=지남(D+), 0=오늘, 양수=남음(D-) */
  daysToDue: number;
  label: string;
};

export type InboxStatus = "open" | "done" | "snoozed";

export type InboxItem = {
  id: string;
  actionKey: string;
  dueOn: string;
  createdAt: string;
  read: boolean;
  status: InboxStatus;
};

export type NotifySettings = {
  /** 알림함/OS 알림을 켤지 */
  enabled: boolean;
  time: string;
  weekends: boolean;
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

export type StatusFilter = "all" | DueKind;
