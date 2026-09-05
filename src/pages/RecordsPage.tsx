import { useEffect, useState } from "react";
import { daysSince, formatKoreanDate } from "../lib/kst";
import type { RecordRow } from "../lib/types";
import { listRecords } from "../storage/records";

export default function RecordsPage() {
  const [rows, setRows] = useState<RecordRow[] | null>(null);

  useEffect(() => {
    void listRecords().then(setRows);
  }, []);

  if (!rows) {
    return <p className="pt-8 text-sm text-mute">목록을 읽는 중</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="pt-16 text-center">
        <p className="text-[15px] text-ink">아직 기록한 일이 없어요.</p>
        <p className="mt-2 text-sm text-mute">말해 보세요.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5 pt-2">
      {rows.map((row) => {
        const elapsed = daysSince(row.lastPerformedOn);
        return (
          <li
            key={row.actionKey}
            className="rounded-2xl border border-line bg-card px-4 py-3.5"
          >
            <p className="text-[16px] font-medium text-ink">{row.actionLabel}</p>
            <p className="mt-1 text-sm text-mute">
              {formatKoreanDate(row.lastPerformedOn)} ·{" "}
              {elapsed === 0 ? "오늘" : `${elapsed}일 전`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
