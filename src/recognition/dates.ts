import { lastWeekdayKst, shiftKstDate, todayKst } from "../lib/kst";

const WEEKDAYS = "월|화|수|목|금|토|일";

export function extractRelativeDate(
  text: string,
  now = new Date(),
): { date: string; matched: string } | null {
  const today = todayKst(now);

  if (/오늘/.test(text)) return { date: today, matched: "오늘" };
  if (/어제/.test(text)) return { date: shiftKstDate(-1, now), matched: "어제" };
  if (/그저께|그제/.test(text))
    return { date: shiftKstDate(-2, now), matched: "그저께" };
  if (/그끄저께|그그제/.test(text))
    return { date: shiftKstDate(-3, now), matched: "그끄저께" };

  const daysAgo = text.match(/(\d+)\s*일\s*전/);
  if (daysAgo) {
    return {
      date: shiftKstDate(-Number(daysAgo[1]), now),
      matched: daysAgo[0],
    };
  }

  if (/이틀\s*전/.test(text))
    return { date: shiftKstDate(-2, now), matched: "이틀 전" };
  if (/사흘\s*전/.test(text))
    return { date: shiftKstDate(-3, now), matched: "사흘 전" };

  const lastWeekday = text.match(
    new RegExp(`지난\\s*(${WEEKDAYS})요일`),
  );
  if (lastWeekday) {
    const date = lastWeekdayKst(lastWeekday[1], now);
    if (date) return { date, matched: lastWeekday[0] };
  }

  if (/지난주|저번\s*주/.test(text))
    return { date: shiftKstDate(-7, now), matched: "지난주" };
  if (/지난달|저번\s*달/.test(text))
    return { date: shiftKstDate(-30, now), matched: "지난달" };

  return null;
}
