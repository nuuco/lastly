import { readFileSync } from "node:fs";
import { lastWeekdayKst, shiftKstDate, todayKst } from "../lib/kst";
import type { ReminderSchedule, UtteranceType } from "../lib/types";

/** 골든셋 날짜 계산 기준 (일요일) */
export const FROZEN_NOW = new Date("2026-09-06T12:00:00+09:00");

export type DateToken =
  | "오늘"
  | "어제"
  | "그저께"
  | "이틀 전"
  | "지난 토요일"
  | "지난주"
  | "지난달"
  | null;

export type EvalFixture = {
  id: number;
  text: string;
  trap: boolean;
  utteranceType: UtteranceType;
  action: string;
  actionAliases: string[];
  dateToken: DateToken;
  schedule: ReminderSchedule | null;
  /** query일 때 시드 목록에서 맞아야 하는 기록 라벨 */
  lookupSeed: string | null;
};

export function resolveDateToken(
  token: DateToken,
  now = FROZEN_NOW,
): string | null {
  if (!token) return null;
  if (token === "오늘") return todayKst(now);
  if (token === "어제") return shiftKstDate(-1, now);
  if (token === "그저께") return shiftKstDate(-2, now);
  if (token === "이틀 전") return shiftKstDate(-2, now);
  if (token === "지난 토요일") return lastWeekdayKst("토", now);
  if (token === "지난주") return shiftKstDate(-7, now);
  if (token === "지난달") return shiftKstDate(-30, now);
  return null;
}

export function countEvalDocRows(): number {
  const md = readFileSync(
    new URL("../../docs/eval-utterances.md", import.meta.url),
    "utf8",
  );
  return md.split("\n").filter((line) => /^\|\s*\d+\s*\|/.test(line)).length;
}

function row(
  id: number,
  text: string,
  utteranceType: UtteranceType,
  action: string,
  dateToken: DateToken,
  schedule: ReminderSchedule | null = null,
  extra?: {
    trap?: boolean;
    aliases?: string[];
    lookupSeed?: string;
  },
): EvalFixture {
  return {
    id,
    text,
    trap: extra?.trap ?? false,
    utteranceType,
    action,
    actionAliases: extra?.aliases ?? [],
    dateToken,
    schedule,
    lookupSeed: extra?.lookupSeed ?? null,
  };
}

export const GOLDEN_FIXTURES: EvalFixture[] = [
  row(1, "오늘 이불 빨았어", "completed", "이불 빨래", "오늘", null, {
    aliases: ["이불"],
  }),
  row(2, "어제 정수기 필터 갈았어", "completed", "정수기 필터", "어제", null, {
    aliases: ["필터"],
  }),
  row(3, "지난 토요일에 에어컨 청소했어", "completed", "에어컨 청소", "지난 토요일", null, {
    aliases: ["에어컨"],
  }),
  row(4, "그저께 화장실 청소했다", "completed", "화장실 청소", "그저께", null, {
    aliases: ["화장실"],
  }),
  row(5, "오늘 아침 설거지 끝냈어", "completed", "설거지", "오늘"),
  row(6, "이틀 전에 커튼 빨아놨어", "completed", "커튼 빨래", "이틀 전", null, {
    aliases: ["커튼"],
  }),
  row(7, "오늘 쓰레기 버렸어", "completed", "쓰레기", "오늘"),
  row(8, "어제 청소기 돌렸어", "completed", "청소기", "어제"),
  row(9, "오늘 강아지 목욕시켰어", "completed", "강아지 목욕", "오늘", null, {
    aliases: ["강아지"],
  }),
  row(10, "지난주에 세탁기 청소했어", "completed", "세탁기 청소", "지난주", null, {
    aliases: ["세탁기"],
  }),
  row(11, "오늘 이불은 안 건드리고 베개만 빨았어", "completed", "베개 빨래", "오늘", null, {
    trap: true,
    aliases: ["베개"],
  }),
  row(12, "필터는 그대로 두고 물통만 갈았어", "completed", "물통", null, null, {
    trap: true,
    aliases: ["물통 교체"],
  }),
  row(13, "청소는 내일로 미루고 설거지만 했어", "completed", "설거지", null, null, {
    trap: true,
  }),
  row(14, "빨래는 나중에 하고 분리수거만 끝냈어", "completed", "분리수거", null, null, {
    trap: true,
  }),
  row(15, "창문은 안 닦고 바닥만 닦았어", "completed", "바닥", null, null, {
    trap: true,
    aliases: ["바닥 닦기"],
  }),

  row(16, "내일 이불 빨 거야", "planned", "이불 빨래", null, null, {
    aliases: ["이불", "이불 빨"],
  }),
  row(17, "주말에 필터 바꿀 예정이야", "planned", "필터", null, null, {
    aliases: ["필터 교체", "필터 바꿀"],
  }),
  row(18, "모레 에어컨 청소하려고", "planned", "에어컨 청소", null, null, {
    aliases: ["에어컨"],
  }),
  row(19, "오늘 저녁에 설거지할게", "planned", "설거지", null),
  row(20, "이따가 쓰레기 버릴게", "planned", "쓰레기", null, null, {
    aliases: ["쓰레기 버릴"],
  }),
  row(21, "다음 주에 커튼 빨 거야", "planned", "커튼 빨래", null, null, {
    aliases: ["커튼", "커튼 빨"],
  }),
  row(22, "내일 아침 청소기 돌릴 예정이야", "planned", "청소기", null, null, {
    aliases: ["청소기 돌릴"],
  }),
  row(23, "주말에 강아지 목욕시킬게", "planned", "강아지 목욕", null, null, {
    aliases: ["강아지"],
  }),
  row(24, "오늘 밤 화장실 청소하려고", "planned", "화장실 청소", null, null, {
    aliases: ["화장실"],
  }),
  row(25, "다음에 세탁기 청소할 거야", "planned", "세탁기 청소", null, null, {
    aliases: ["세탁기", "세탁기 청소할"],
  }),
  row(26, "어제 하려고 했는데 내일 이불 빨 거야", "planned", "이불 빨래", null, null, {
    trap: true,
    aliases: ["이불", "이불 빨"],
  }),
  row(27, "필터는 아직이고 주말에 갈 예정이야", "planned", "필터", null, null, {
    trap: true,
    aliases: ["필터 교체"],
  }),
  row(28, "청소는 못 했고 내일 하려고", "incomplete", "청소", null, null, {
    trap: true,
  }),
  row(29, "설거지는 안 했고 이따가 할게", "incomplete", "설거지", null, null, {
    trap: true,
  }),
  row(30, "빨래는 끝낸 줄 알았는데 내일 다시 빨 거야", "planned", "빨래", null, null, {
    trap: true,
    aliases: ["이불 빨래"],
  }),

  row(31, "오늘 이불 못 빨았어", "incomplete", "이불 빨래", "오늘", null, {
    aliases: ["이불"],
  }),
  row(32, "필터 아직 안 갈았어", "incomplete", "필터", null, null, {
    aliases: ["정수기 필터", "필터 교체"],
  }),
  row(33, "오늘 청소하려다 못 했어", "incomplete", "청소", "오늘"),
  row(34, "어제 설거지 안 했어", "incomplete", "설거지", "어제"),
  row(35, "쓰레기 아직 못 버렸어", "incomplete", "쓰레기", null),
  row(36, "커튼은 아직 안 빨았어", "incomplete", "커튼 빨래", null, null, {
    aliases: ["커튼"],
  }),
  row(37, "청소기 돌리다가 못 했어", "incomplete", "청소기", null),
  row(38, "강아지 목욕은 안 시켰어", "incomplete", "강아지 목욕", null, null, {
    aliases: ["강아지"],
  }),
  row(39, "화장실 청소를 하지 못했어", "incomplete", "화장실 청소", null, null, {
    aliases: ["화장실"],
  }),
  row(40, "세탁기 청소는 아직이야", "incomplete", "세탁기 청소", null, null, {
    aliases: ["세탁기"],
  }),
  row(41, "오늘 빨래는 못 했고 설거지만 했어", "incomplete", "빨래", "오늘", null, {
    trap: true,
    aliases: ["설거지"],
  }),
  row(42, "어제 빨려고 했는데 안 했어", "incomplete", "빨래", "어제", null, {
    trap: true,
    aliases: ["빨"],
  }),
  row(43, "필터는 갈았는데 이불은 못 빨았어", "incomplete", "이불 빨래", null, null, {
    trap: true,
    aliases: ["이불", "필터"],
  }),
  row(44, "청소는 했어도 창문은 안 닦았어", "incomplete", "창문", null, null, {
    trap: true,
    aliases: ["청소"],
  }),
  row(45, "쓰레기 버렸는데 분리수거는 못 했어", "incomplete", "분리수거", null, null, {
    trap: true,
    aliases: ["쓰레기"],
  }),

  row(46, "지난주쯤 이불 빨았던 것 같은데", "uncertain", "이불 빨래", "지난주", null, {
    aliases: ["이불"],
  }),
  row(47, "필터 언제 갈았더라", "uncertain", "필터", null, null, {
    aliases: ["정수기 필터"],
  }),
  row(48, "아마 어제 청소했던가", "uncertain", "청소", "어제"),
  row(49, "이불 빨았던 게 지난주였나", "uncertain", "이불 빨래", "지난주", null, {
    aliases: ["이불"],
  }),
  row(50, "그저께쯤 설거지한 것 같아", "uncertain", "설거지", "그저께"),
  row(51, "쓰레기 버린 지가 며칠 됐지 싶어", "uncertain", "쓰레기", null),
  row(52, "커튼은 아마 지난달에 빨았나", "uncertain", "커튼 빨래", "지난달", null, {
    aliases: ["커튼"],
  }),
  row(53, "청소기 돌린 게 언제였더라", "uncertain", "청소기", null),
  row(54, "강아지 목욕시킨 지 꽤 된 것 같아", "uncertain", "강아지 목욕", null, null, {
    aliases: ["강아지"],
  }),
  row(55, "화장실 청소가 저번 주쯤이었나", "uncertain", "화장실 청소", "지난주", null, {
    aliases: ["화장실"],
  }),
  row(56, "빨래는 한 것 같기도 하고 안 한 것 같기도 해", "uncertain", "빨래", null, null, {
    trap: true,
  }),
  row(57, "필터는 간 것 같은데 정확히 언제인지 모르겠어", "uncertain", "필터", null, null, {
    trap: true,
    aliases: ["정수기 필터"],
  }),
  row(58, "청소는 못 한 것 같기도 하고 한 것 같기도 해", "uncertain", "청소", null, null, {
    trap: true,
  }),
  row(59, "설거지는 어제인가 그저께인가 했어", "uncertain", "설거지", "어제", null, {
    trap: true,
  }),
  row(60, "이불은 빨았나 안 빨았나 기억이 안 나", "uncertain", "이불 빨래", null, null, {
    trap: true,
    aliases: ["이불"],
  }),

  row(61, "나 이불 빨래 언제 했어?", "query", "이불 빨래", null, null, {
    aliases: ["이불"],
    lookupSeed: "이불 빨래",
  }),
  row(62, "필터 갈아끼운 지 며칠이야?", "query", "필터", null, null, {
    aliases: ["필터 교체", "필터 갈아끼운", "정수기 필터"],
    lookupSeed: "필터 교체",
  }),
  row(63, "청소기 돌린 지 며칠 됐어?", "query", "청소기", null, null, {
    aliases: ["청소기 돌린"],
    lookupSeed: "청소기",
  }),
  row(64, "마지막에 커튼 언제 빨았어?", "query", "커튼 빨래", null, null, {
    aliases: ["커튼"],
    lookupSeed: "커튼 빨래",
  }),
  row(65, "설거지 언제 했지?", "query", "설거지", null, null, {
    lookupSeed: "설거지",
  }),
  row(66, "오늘 이불 빨았어, 일주일마다 알려줘", "completed", "이불 빨래", "오늘", {
    kind: "everyDays",
    days: 7,
  }, { aliases: ["이불"] }),
  row(67, "어제 필터 갈았어 3일마다", "completed", "필터", "어제", {
    kind: "everyDays",
    days: 3,
  }, { aliases: ["정수기 필터"] }),
  row(68, "쓰레기 버렸어 보름마다 알려줘", "completed", "쓰레기", null, {
    kind: "everyDays",
    days: 15,
  }),
  row(69, "강아지 목욕시켰어 한 달마다", "completed", "강아지 목욕", null, {
    kind: "everyMonths",
    months: 1,
  }, { aliases: ["강아지"] }),
  row(70, "오늘 설거지 끝냈어", "completed", "설거지", "오늘"),
  row(71, "이불 빨래 한 지 얼마야?", "query", "이불 빨래", null, null, {
    aliases: ["이불"],
    lookupSeed: "이불 빨래",
  }),
  row(72, "필터 언제 갈았어?", "query", "필터", null, null, {
    aliases: ["정수기 필터", "필터 교체"],
    lookupSeed: "필터 교체",
  }),
  row(73, "에어컨 청소 언제 했어", "query", "에어컨 청소", null, null, {
    aliases: ["에어컨"],
    lookupSeed: "에어컨 청소",
  }),
  row(74, "오늘 커튼 빨았어 14일마다 알려줘", "completed", "커튼 빨래", "오늘", {
    kind: "everyDays",
    days: 14,
  }, { aliases: ["커튼"] }),
  row(75, "화장실 청소했어 이틀마다", "completed", "화장실 청소", null, {
    kind: "everyDays",
    days: 2,
  }, { aliases: ["화장실"] }),
  row(76, "오늘 이불 빨았어 매주 금요일 알려줘", "completed", "이불 빨래", "오늘", {
    kind: "weekly",
    weekday: 5,
  }, { aliases: ["이불"] }),
  row(77, "오늘 필터 갈았어 매월 10일마다 알려줘", "completed", "필터", "오늘", {
    kind: "monthlyDay",
    day: 10,
  }, { aliases: ["정수기 필터"] }),
  row(78, "오늘 화장실 청소했어 매월 마지막 수요일 알려줘", "completed", "화장실 청소", "오늘", {
    kind: "monthlyNthWeekday",
    nth: -1,
    weekday: 3,
  }, { aliases: ["화장실"] }),
  row(79, "오늘 커튼 빨았어 매월 둘째 일요일 알려줘", "completed", "커튼 빨래", "오늘", {
    kind: "monthlyNthWeekday",
    nth: 2,
    weekday: 0,
  }, { aliases: ["커튼"] }),
];

export const QUERY_FIXTURES = GOLDEN_FIXTURES.filter(
  (fx) => fx.utteranceType === "query",
);

/** 조회 매칭용 시드 목록 — 골든 query lookupSeed + 근처 기록 */
export const LOOKUP_SEED_LABELS = [
  "이불 빨래",
  "필터 교체",
  "청소기",
  "커튼 빨래",
  "설거지",
  "에어컨 청소",
  "화장실 청소",
  "강아지 목욕",
] as const;
