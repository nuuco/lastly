/**
 * 브라우저 Web Speech 실시간 받아쓰기.
 * Whisper 등 로컬 STT는 쓰지 않는다. (폴백은 호출 측에서 처리)
 */

export type SpeechErrorKind =
  | "unsupported"
  | "mic_denied"
  | "network"
  | "unknown";

export type SpeechRecognitionHandle = {
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechCallbacks = {
  onResult: (finalText: string, interimText: string) => void;
  onError: (kind: SpeechErrorKind) => void;
  onStart?: () => void;
  onEnd?: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

let activeRecognition: SpeechRecognitionLike | null = null;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

function isIosDevice(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isAndroidDevice(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function isStandalonePwa(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

/** iOS PWA standalone은 API만 있고 동작하지 않는 경우가 많다 */
export function canUseLiveSpeech(): boolean {
  if (!isSpeechSupported()) return false;
  if (isIosDevice() && isStandalonePwa()) return false;
  return true;
}

/**
 * Chromium은 getUserMedia와 Web Speech를 같이 쓰면 network 오류가 잦다.
 * Safari·iOS는 동시 사용이 안정적이다.
 */
export function isChromium(): boolean {
  return /Chrome|Chromium|Edg|OPR/.test(navigator.userAgent);
}

export function canRecordWhileDictating(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)) return true;
  if (isChromium()) return false;
  return true;
}

export function mergeTranscripts(committed: string, addition: string): string {
  if (!addition) return committed;
  if (!committed) return addition;
  if (addition.startsWith(committed)) return addition;
  if (committed.startsWith(addition)) return committed;
  if (committed.includes(addition)) return committed;
  const needsSpace =
    !committed.endsWith(" ") &&
    !addition.startsWith(" ") &&
    !/^\p{P}/u.test(addition);
  return needsSpace ? `${committed} ${addition}` : committed + addition;
}

export function advanceAndroidTranscript(
  current: string,
  incoming: string,
): string | null {
  const text = incoming.trim();
  if (!text) return null;
  if (text === current || current.startsWith(text)) return null;
  if (text.startsWith(current)) return text;
  return mergeTranscripts(current, text);
}

function buildAndroidDisplay(committed: string, session: string): string {
  if (!session) return committed;
  if (!committed) return session;
  if (session.startsWith(committed)) return session;
  return mergeTranscripts(committed, session);
}

/** 클릭 제스처 안에서 마이크를 열었다가 바로 닫아 권한만 확보한다 */
export async function ensureMicrophoneAccess(): Promise<
  "granted" | "denied" | "unavailable"
> {
  if (!window.isSecureContext) return "unavailable";

  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      if (status.state === "granted") return "granted";
      if (status.state === "denied") return "denied";
    } catch {
      // Safari 등은 query가 막힐 수 있다
    }
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return isSpeechSupported() ? "granted" : "unavailable";
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return "granted";
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "denied";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "unavailable";
    }
    return "denied";
  }
}

export async function isOnDeviceSpeechAvailable(): Promise<boolean> {
  const Ctor = getSpeechRecognitionCtor() as SpeechRecognitionCtor & {
    available?: (opts: {
      langs?: string[];
      processLocally?: boolean;
    }) => Promise<"available" | "unavailable" | "downloading" | boolean>;
  } | null;
  if (!Ctor?.available) return false;
  try {
    const status = await Ctor.available({
      langs: ["ko-KR"],
      processLocally: true,
    });
    return status === "available" || status === true;
  } catch {
    return false;
  }
}

export function liveSpeechErrorLabel(kind: SpeechErrorKind): string {
  const labels: Record<SpeechErrorKind, string> = {
    unsupported: "이 브라우저는 실시간 받아쓰기를 못 해요",
    mic_denied: "마이크 권한이 막혀 있어요",
    network: "받아쓰기 서버에 연결하지 못했어요",
    unknown: "받아쓰기가 끊겼어요",
  };
  return labels[kind];
}

/** 응/아니 한 마디용. 실시간 받아쓰기와 별개 */
export function recognizeOnce(options?: {
  timeoutMs?: number;
}): Promise<string> {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    return Promise.reject(new Error("이 브라우저는 음성 인식을 지원하지 않습니다"));
  }

  return new Promise((resolve, reject) => {
    const recognition = new Ctor();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    const timer = window.setTimeout(() => {
      recognition.abort();
      reject(new Error("음성 인식 시간이 초과되었습니다"));
    }, options?.timeoutMs ?? 8000);

    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript?.trim() ?? "";
      window.clearTimeout(timer);
      resolve(text);
    };
    recognition.onerror = (event) => {
      window.clearTimeout(timer);
      reject(new Error(event.error));
    };
    recognition.onend = () => {
      window.clearTimeout(timer);
    };
    try {
      recognition.start();
    } catch (error) {
      window.clearTimeout(timer);
      reject(error);
    }
  });
}

/**
 * Web Speech 실시간 STT. AI 없음.
 * start()를 눌러야 듣기 시작하고, 말하는 동안 onResult로 글이 온다.
 */
export function createSpeechRecognition(
  callbacks: SpeechCallbacks,
): SpeechRecognitionHandle | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    callbacks.onError("unsupported");
    return null;
  }

  if (activeRecognition) {
    try {
      activeRecognition.onend = null;
      activeRecognition.onerror = null;
      activeRecognition.abort();
    } catch {
      // ignore
    }
    activeRecognition = null;
  }

  const recognition = new Ctor();
  recognition.lang = "ko-KR";
  const useAndroidStrategy = isAndroidDevice();
  recognition.continuous = !useAndroidStrategy;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  activeRecognition = recognition;

  let committedTranscript = "";
  let androidSessionTranscript = "";
  let lastSessionFinal = "";
  let stopped = false;
  let networkRetries = 0;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  const MAX_NETWORK_RETRIES = 3;

  const buildSessionTranscript = (
    results: SpeechRecognitionEventLike["results"],
  ): { sessionFinal: string; interim: string } => {
    let sessionFinal = "";
    let interim = "";
    for (let i = 0; i < results.length; i += 1) {
      const result = results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) sessionFinal += text;
      else interim = text;
    }
    return { sessionFinal, interim };
  };

  const releaseActive = () => {
    if (activeRecognition === recognition) activeRecognition = null;
  };

  const clearRestartTimer = () => {
    if (restartTimer !== null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  const tryStart = () => {
    if (stopped) return;
    try {
      recognition.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 이미 켜진 경우는 무시. 그 외는 화면에 알려야 한다
      if (/already started|InvalidStateError/i.test(message)) return;
      stopped = true;
      clearRestartTimer();
      releaseActive();
      callbacks.onError("unknown");
    }
  };

  const scheduleRestart = (delayMs: number) => {
    clearRestartTimer();
    restartTimer = setTimeout(() => {
      restartTimer = null;
      tryStart();
    }, delayMs);
  };

  recognition.onstart = () => {
    callbacks.onStart?.();
  };

  recognition.onresult = (event) => {
    networkRetries = 0;

    if (useAndroidStrategy) {
      const results = event.results;
      if (results.length === 0) return;
      const last = results[results.length - 1];
      const incoming = last[0]?.transcript ?? "";
      const next = advanceAndroidTranscript(androidSessionTranscript, incoming);
      if (next === null) return;
      androidSessionTranscript = next;
      callbacks.onResult(
        buildAndroidDisplay(committedTranscript, androidSessionTranscript),
        "",
      );
      return;
    }

    const { sessionFinal, interim } = buildSessionTranscript(event.results);
    lastSessionFinal = sessionFinal;
    callbacks.onResult(committedTranscript + sessionFinal, interim);
  };

  recognition.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      stopped = true;
      clearRestartTimer();
      releaseActive();
      callbacks.onError("mic_denied");
      return;
    }
    if (event.error === "audio-capture") {
      stopped = true;
      clearRestartTimer();
      releaseActive();
      callbacks.onError("mic_denied");
      return;
    }
    if (event.error === "aborted" || event.error === "no-speech") return;
    if (event.error === "network") {
      if (networkRetries >= MAX_NETWORK_RETRIES) {
        stopped = true;
        clearRestartTimer();
        releaseActive();
        callbacks.onError("network");
        return;
      }
      networkRetries += 1;
      return;
    }
    stopped = true;
    clearRestartTimer();
    releaseActive();
    callbacks.onError("unknown");
  };

  recognition.onend = () => {
    if (stopped) {
      clearRestartTimer();
      releaseActive();
      callbacks.onEnd?.();
      return;
    }
    if (useAndroidStrategy) {
      committedTranscript = mergeTranscripts(
        committedTranscript,
        androidSessionTranscript,
      );
      androidSessionTranscript = "";
    } else {
      committedTranscript += lastSessionFinal;
      lastSessionFinal = "";
    }
    scheduleRestart(networkRetries > 0 ? 300 : 0);
  };

  return {
    start: () => {
      stopped = false;
      networkRetries = 0;
      committedTranscript = "";
      androidSessionTranscript = "";
      lastSessionFinal = "";
      tryStart();
    },
    stop: () => {
      stopped = true;
      clearRestartTimer();
      releaseActive();
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    },
    abort: () => {
      stopped = true;
      clearRestartTimer();
      releaseActive();
      try {
        recognition.onend = null;
        recognition.onerror = null;
        recognition.abort();
      } catch {
        // ignore
      }
    },
  };
}
