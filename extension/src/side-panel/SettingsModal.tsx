import { useState } from "react";
import { useSettings } from "../state/useSettings";
import { MODELS } from "../lib/anthropic";

export const SettingsModal = ({ onClose }: { onClose: () => void }) => {
  const { settings, save } = useSettings();
  const [draftKey, setDraftKey] = useState(settings.anthropic_api_key);
  const [showKey, setShowKey] = useState(false);

  const handleSave = async () => {
    await save({ anthropic_api_key: draftKey.trim() });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{ width: "100%", maxWidth: 360 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-title">Settings</div>

        <label className="col" style={{ marginBottom: 12 }}>
          <span className="label">Anthropic API Key</span>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type={showKey ? "text" : "password"}
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
            />
            <button
              type="button"
              className="ghost"
              onClick={() => setShowKey((s) => !s)}
              style={{ fontSize: 10, padding: "4px 8px" }}
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <div className="dim" style={{ fontSize: 10, marginTop: 4 }}>
            Stored locally in chrome.storage. Get one at{" "}
            <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" style={{ color: "var(--gold)" }}>
              console.anthropic.com
            </a>.
          </div>
        </label>

        <label className="col" style={{ marginBottom: 12 }}>
          <span className="label">Model</span>
          <select value={settings.model} onChange={(e) => void save({ model: e.target.value })}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
          <button onClick={onClose} className="ghost">Cancel</button>
          <button onClick={handleSave} className="primary">Save</button>
        </div>
      </div>
    </div>
  );
};
