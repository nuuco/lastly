import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import TimePicker from "../components/TimePicker";
import {
  loadNotifySettings,
  permissionLabel,
  saveNotifySettings,
} from "../lib/settings";
import { ensureNotificationPermission } from "../lib/notify";
import type { NotifySettings } from "../lib/types";

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotifySettings>(() =>
    loadNotifySettings(),
  );
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    "default",
  );

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

  const askPerm = async () => {
    const result = await ensureNotificationPermission();
    setPerm(result);
  };

  return (
    <div className="screen subpage">
      <header className="subhead">
        <Link to="/settings" className="back-link" aria-label="뒤로">
          ‹
        </Link>
        <div className="subhead-title">알림 설정</div>
        <div className="subhead-spacer" />
      </header>
      <div className="subbody">
        <div className="settings-card">
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
        <p className="settings-note">
          앱을 열었을 때만 알려 줘요. 꺼진 앱을 깨우지는 않아요.
        </p>
      </div>
    </div>
  );
}
