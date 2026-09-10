import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import TimePicker from "../components/TimePicker";
import { clearAllRecords } from "../storage/records";
import { ensureNotificationPermission } from "../lib/notify";
import {
  loadNotifySettings,
  loadVoiceGuideEnabled,
  permissionLabel,
  saveNotifySettings,
  saveVoiceGuideEnabled,
} from "../lib/settings";
import type { NotifySettings } from "../lib/types";

export default function SettingsPage() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    "default",
  );
  const [settings, setSettings] = useState<NotifySettings>(() =>
    loadNotifySettings(),
  );
  const [voiceGuide, setVoiceGuide] = useState(() => loadVoiceGuideEnabled());
  const [cleared, setCleared] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);

  useEffect(() => {
    if (!("Notification" in window)) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission);
  }, []);

  const persist = (next: NotifySettings) => {
    setSettings(next);
    saveNotifySettings(next);
  };

  const persistVoice = (enabled: boolean) => {
    setVoiceGuide(enabled);
    saveVoiceGuideEnabled(enabled);
    if (!enabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const askPerm = async () => {
    const result = await ensureNotificationPermission();
    setPerm(result);
  };

  const wipe = async () => {
    await clearAllRecords();
    setWipeOpen(false);
    setCleared(true);
  };

  return (
    <div className="screen subpage">
      <header className="subhead">
        <Link to="/" className="back-link" aria-label="뒤로">
          ‹
        </Link>
        <div className="subhead-title">설정</div>
        <div className="subhead-spacer" />
      </header>
      <div className="subbody">
        <div className="settings-card">
          <div className="settings-row">
            <span>음성 안내</span>
            <button
              type="button"
              role="switch"
              aria-checked={voiceGuide}
              className={`toggle${voiceGuide ? " on" : ""}`}
              onClick={() => persistVoice(!voiceGuide)}
            >
              <span className="toggle-knob" />
            </button>
          </div>
          <div className="settings-row">
            <span>알림</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              className={`toggle${settings.enabled ? " on" : ""}`}
              onClick={() =>
                persist({ ...settings, enabled: !settings.enabled })
              }
            >
              <span className="toggle-knob" />
            </button>
          </div>

          {settings.enabled ? (
            <>
              <div className="settings-row">
                <span>알림 권한</span>
                <button
                  type="button"
                  className="settings-chip"
                  onClick={() => void askPerm()}
                >
                  {permissionLabel(perm)}
                </button>
              </div>

              <div className="settings-row">
                <span>알림 받을 시간</span>
                <TimePicker
                  value={settings.time}
                  onChange={(time) => persist({ ...settings, time })}
                />
              </div>

              <div className="settings-row">
                <span>주말에도 알림</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.weekends}
                  className={`toggle${settings.weekends ? " on" : ""}`}
                  onClick={() =>
                    persist({ ...settings, weekends: !settings.weekends })
                  }
                >
                  <span className="toggle-knob" />
                </button>
              </div>
            </>
          ) : null}
        </div>
        <div className="settings-card">
          <button
            type="button"
            className="settings-row danger"
            onClick={() => setWipeOpen(true)}
          >
            이 기기 데이터 삭제
          </button>
        </div>
        {cleared ? (
          <p className="settings-note">기록을 모두 지웠어요.</p>
        ) : null}
      </div>

      {wipeOpen ? (
        <div
          className="modal-scrim"
          onClick={(event) => {
            if (event.target === event.currentTarget) setWipeOpen(false);
          }}
        >
          <div className="modal-card" role="dialog" aria-labelledby="wipe-title">
            <div className="modal-top">
              <h2 id="wipe-title">기록을 모두 지울까요?</h2>
              <button
                type="button"
                className="sheet-x"
                aria-label="닫기"
                onClick={() => setWipeOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="modal-body">
              이 기기의 기록과 알림함을 삭제해요. 되돌릴 수 없어요.
            </p>
            <button
              type="button"
              className="confirm danger-fill"
              onClick={() => void wipe()}
            >
              삭제할게요
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setWipeOpen(false)}
            >
              취소
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
