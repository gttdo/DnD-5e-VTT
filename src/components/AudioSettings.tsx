import { Icon } from "./ui/Icon";
import { audioBus, useAudioSettings, type AudioChannel } from "../lib/audioBus";

/**
 * The audio mixer popover (per-device) — a player's own volume/mute for the two
 * channels: Narrator (the read-aloud voice) and Ambiance (the scene score).
 * Client-only; never affects anyone else's device.
 */

const Channel = ({
  channel,
  label,
  icon,
  vol,
  muted,
}: {
  channel: AudioChannel;
  label: string;
  icon: "story" | "music";
  vol: number;
  muted: boolean;
}) => {
  const volKey = channel === "narrator" ? "narratorVol" : "ambianceVol";
  const muteKey = channel === "narrator" ? "narratorMuted" : "ambianceMuted";
  return (
    <div className="audio-ch">
      <button
        className={`audio-ch-mute ${muted ? "is-muted" : ""}`}
        onClick={() => audioBus.set({ [muteKey]: !muted })}
        title={muted ? `Unmute ${label}` : `Mute ${label}`}
        aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}
      >
        <Icon name={muted ? "mute" : icon} size={15} />
      </button>
      <div className="audio-ch-body">
        <div className="audio-ch-label">{label}</div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(vol * 100)}
          onChange={(e) => audioBus.set({ [volKey]: Number(e.target.value) / 100, [muteKey]: false })}
          aria-label={`${label} volume`}
          className={muted ? "is-muted" : ""}
        />
      </div>
      <span className="audio-ch-pct">{muted ? "—" : `${Math.round(vol * 100)}%`}</span>
    </div>
  );
};

export const AudioSettingsPopover = ({ onClose }: { onClose: () => void }) => {
  const s = useAudioSettings();
  return (
    <>
      <div className="audio-veil" onClick={onClose} />
      <div className="audio-pop" role="dialog" aria-label="Audio settings">
        <div className="audio-pop-head">
          <span>Audio</span>
          <button
            className={`audio-master ${s.masterMuted ? "is-muted" : ""}`}
            onClick={() => audioBus.set({ masterMuted: !s.masterMuted })}
            title={s.masterMuted ? "Unmute all" : "Mute all"}
          >
            <Icon name={s.masterMuted ? "mute" : "volume"} size={13} />
            {s.masterMuted ? "Muted" : "Mute all"}
          </button>
        </div>
        <Channel channel="narrator" label="Narrator" icon="story" vol={s.narratorVol} muted={s.narratorMuted || s.masterMuted} />
        <Channel channel="ambiance" label="Ambiance" icon="music" vol={s.ambianceVol} muted={s.ambianceMuted || s.masterMuted} />
        <div className="audio-pop-note">Your device only — this never changes anyone else's volume.</div>
      </div>
    </>
  );
};
