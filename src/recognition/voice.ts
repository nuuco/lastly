import { shiftKstDate, todayKst } from "../lib/kst";
import type { ReminderSchedule } from "../lib/types";
import { extractRelativeDate } from "./dates";
import { formatScheduleLabel, normalizeSchedule } from "./intervals";

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 1;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    // onend가 안 오는 브라우저 대비
    const timer = window.setTimeout(done, Math.min(12000, 1800 + text.length * 120));
    utterance.onend = done;
    utterance.onerror = done;
    try {
      window.speechSynthesis.resume();
    } catch {
      // ignore
    }
    window.speechSynthesis.speak(utterance);
  });
}

/** TTS·화면에 쓸 날짜 말: 오늘 / 어제 / 그저께 / 9월 12일 */
export function formatSpeakDate(isoDate: string, now = new Date()): string {
  const today = todayKst(now);
  if (isoDate === today) return "오늘";
  if (isoDate === shiftKstDate(-1, now)) return "어제";
  if (isoDate === shiftKstDate(-2, now)) return "그저께";
  const [y, m, d] = isoDate.split("-");
  if (y === today.slice(0, 4)) return `${Number(m)}월 ${Number(d)}일`;
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

function objectParticle(word: string): string {
  const last = word.at(-1);
  if (!last || !/[가-힣]/.test(last)) return "을";
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0) return "을";
  return code % 28 === 0 ? "를" : "을";
}

export function confirmPhrase(
  action: string,
  date: string,
  schedule?: ReminderSchedule | number | null,
  now = new Date(),
): string {
  const label = formatSpeakDate(date, now);
  let sched: ReminderSchedule | null = null;
  if (typeof schedule === "number") {
    sched = schedule >= 1 ? { kind: "everyDays", days: schedule } : null;
  } else {
    sched = normalizeSchedule(schedule);
  }
  const part = sched ? formatScheduleLabel(sched) : null;
  if (sched && part) {
    const connector =
      sched.kind === "weekly" ||
      sched.kind === "monthlyDay" ||
      sched.kind === "monthlyNthWeekday"
        ? "에"
        : "";
    return `${action}${objectParticle(action)} ${label}로 기록하고, ${part}${connector} 알려줄까요?`;
  }
  return `${action}${objectParticle(action)} ${label}로 기록할까요?`;
}

export function savedPhrase(): string {
  return "기록했습니다.";
}

export function cancelledPhrase(): string {
  return "취소했어요.";
}

const YES =
  /^(응|네|예|맞아|그래|좋아|기록해|저장해)($|\s|요|어)|^어$/;
const NO_ONLY = /^(아니|아니요|아뇨|취소|됐어|그만|싫어)\s*$/;

export type VoiceConfirm = "yes" | "no" | "unclear";

export function classifyConfirm(text: string): VoiceConfirm {
  const trimmed = text.trim();
  if (YES.test(trimmed)) return "yes";
  if (NO_ONLY.test(trimmed)) return "no";
  if (/^(취소|됐어|그만|싫어)/.test(trimmed)) return "no";
  return "unclear";
}

export type ConfirmReply =
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "revise"; action: string; date: string }
  | { kind: "unclear" };

/** 9월 12일 / 9/12 */
export function extractMonthDayDate(
  text: string,
  now = new Date(),
): { date: string; matched: string } | null {
  const slash = text.match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})/);
  const named = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  const hit = named ?? slash;
  if (!hit) return null;
  const month = Number(hit[1]);
  const day = Number(hit[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = Number(todayKst(now).slice(0, 4));
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { date, matched: hit[0] };
}

/**
 * 확인 답변: 응/아니, 또는 "어제야" / "아니 시트로"처럼 수정.
 * 분명한 긍정만 저장하고, 애매하면 unclear.
 */
export function interpretConfirmReply(
  text: string,
  current: { action: string; date: string },
  now = new Date(),
): ConfirmReply {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "unclear" };

  if (YES.test(trimmed) && trimmed.length <= 12) return { kind: "yes" };
  if (NO_ONLY.test(trimmed)) return { kind: "no" };
  if (/^(취소|됐어|그만|싫어)다?$/.test(trimmed)) return { kind: "no" };

  const dateHit =
    extractRelativeDate(trimmed, now) ?? extractMonthDayDate(trimmed, now);

  let leftover = trimmed
    .replace(/^(응|네|예|맞아|어|그래|아니(?:요|오)?|아뇨)\s*/u, "")
    .replace(dateHit?.matched ?? "", " ")
    .replace(
      /\s*(으로|로)?\s*(기록|저장)?(할)?(까요|해|해줘|해 줘)?\s*$/u,
      "",
    )
    .replace(/(으로|로|이야|예요|야|으로요)/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (dateHit && leftover.length < 2) {
    return { kind: "revise", action: current.action, date: dateHit.date };
  }

  if (leftover.length >= 2) {
    leftover = leftover.replace(/^(말고|아니라)\s*/u, "").trim();
    return {
      kind: "revise",
      action: leftover || current.action,
      date: dateHit?.date ?? current.date,
    };
  }

  if (dateHit) {
    return { kind: "revise", action: current.action, date: dateHit.date };
  }

  return { kind: "unclear" };
}
