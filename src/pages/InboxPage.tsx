import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import DateField from "../components/DateField";
import { dueInfo, shiftKstDate, todayKst } from "../lib/kst";
import type { InboxItem, RecordRow } from "../lib/types";
import {
  getRecord,
  listOpenInbox,
  listRecords,
  markInbox,
  markInboxByAction,
  updateRecord,
  upsertRecord,
} from "../storage/records";

type ActionTarget = {
  item: InboxItem;
  row: RecordRow;
};

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [rowsByKey, setRowsByKey] = useState<Map<string, RecordRow>>(new Map());
  const [target, setTarget] = useState<ActionTarget | null>(null);
  const [otherDate, setOtherDate] = useState(false);
  const [pickDate, setPickDate] = useState(todayKst());
  const [toast, setToast] = useState("");

  const reload = async () => {
    const [inbox, records] = await Promise.all([
      listOpenInbox(),
      listRecords(),
    ]);
    const map = new Map(records.map((r) => [r.actionKey, r]));
    setRowsByKey(map);
    setItems(inbox.filter((i) => map.has(i.actionKey)));
  };

  useEffect(() => {
    void reload();
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2000);
  };

  const openAction = async (item: InboxItem) => {
    const row = rowsByKey.get(item.actionKey) ?? (await getRecord(item.actionKey));
    if (!row) return;
    await markInbox(item.id, { read: true });
    setTarget({ item, row });
    setOtherDate(false);
    setPickDate(todayKst());
  };

  const completeToday = async () => {
    if (!target) return;
    await upsertRecord({
      actionLabel: target.row.actionLabel,
      lastPerformedOn: todayKst(),
      lastUtterance: "오늘 했어요",
      inputPath: "manual",
      schedule: target.row.schedule,
      memo: target.row.memo,
      clearSnooze: true,
    });
    await markInboxByAction(target.row.actionKey, "done");
    setTarget(null);
    showToast("오늘로 기록했어요");
    await reload();
  };

  const completeOther = async () => {
    if (!target) return;
    await upsertRecord({
      actionLabel: target.row.actionLabel,
      lastPerformedOn: pickDate,
      lastUtterance: "다른 날 했어요",
      inputPath: "manual",
      schedule: target.row.schedule,
      memo: target.row.memo,
      clearSnooze: true,
    });
    await markInboxByAction(target.row.actionKey, "done");
    setTarget(null);
    setOtherDate(false);
    showToast("기록했어요");
    await reload();
  };

  const snooze = async () => {
    if (!target) return;
    const until = shiftKstDate(1);
    await updateRecord({
      previousKey: target.row.actionKey,
      actionLabel: target.row.actionLabel,
      lastPerformedOn: target.row.lastPerformedOn,
      schedule: target.row.schedule,
      memo: target.row.memo,
      snoozeUntil: until,
    });
    await markInboxByAction(target.row.actionKey, "snoozed");
    setTarget(null);
    showToast("내일 다시 알려 줄게요");
    await reload();
  };

  return (
    <div className="screen subpage">
      <header className="subhead">
        <Link to="/" className="back-link" aria-label="뒤로">
          ‹
        </Link>
        <div className="subhead-title">알림</div>
        <div className="subhead-spacer" />
      </header>
      <div className="subbody">
        {items.length === 0 ? (
          <div className="empty">지금 볼 알림이 없어요.</div>
        ) : (
          <div className="inbox-list">
            {items.map((item) => {
              const row = rowsByKey.get(item.actionKey);
              if (!row) return null;
              const info = dueInfo(
                row.lastPerformedOn,
                row.schedule,
                row.snoozeUntil,
              );
              return (
                <button
                  type="button"
                  key={item.id}
                  className="inbox-row"
                  onClick={() => void openAction(item)}
                >
                  <div className="inbox-main">
                    <div className="name">{row.actionLabel}</div>
                    {row.memo ? <div className="memo">{row.memo}</div> : null}
                  </div>
                  {info ? (
                    <span className={`dday ${info.kind}`}>{info.label}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {target ? (
        <div className="overlay open">
          <button
            type="button"
            className="overlay-x"
            aria-label="닫기"
            onClick={() => setTarget(null)}
          >
            ×
          </button>
          <div className="sheet">
            <div className="result">
              {!otherDate ? (
                <>
                  <div className="eyebrow">알림 확인</div>
                  <div className="action-head">
                    <div>
                      <div className="action-title">{target.row.actionLabel}</div>
                      {target.row.memo ? (
                        <div className="action-memo">{target.row.memo}</div>
                      ) : (
                        <div className="action-sub">
                          앱을 열었을 때 알려 주는 알림이에요
                        </div>
                      )}
                    </div>
                    {(() => {
                      const info = dueInfo(
                        target.row.lastPerformedOn,
                        target.row.schedule,
                        target.row.snoozeUntil,
                      );
                      return info ? (
                        <span className={`dday ${info.kind}`}>{info.label}</span>
                      ) : null;
                    })()}
                  </div>
                  <button
                    type="button"
                    className="confirm"
                    onClick={() => void completeToday()}
                  >
                    오늘 했어요
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setOtherDate(true)}
                  >
                    다른 날 했어요
                  </button>
                  <div className="sheet-secondary single">
                    <button
                      type="button"
                      className="sheet-text-btn"
                      onClick={() => void snooze()}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                      나중에 알려줘
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="eyebrow">언제 했어요?</div>
                  <DateField value={pickDate} onChange={setPickDate} />
                  <button
                    type="button"
                    className="confirm"
                    onClick={() => void completeOther()}
                  >
                    이 날짜로 기록
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setOtherDate(false)}
                  >
                    뒤로
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
