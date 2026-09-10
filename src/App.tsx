import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import InboxPage from "./pages/InboxPage";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-stage">
        <div className="phone">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/notifications" element={<InboxPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="/settings/notifications"
              element={<NotificationSettingsPage />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
