import { useSyncExternalStore } from "react";

/**
 * The audio mixer (per-device) — one small store the settings panel writes and
 * every audio source reads, so a player's volume/mute is their own and never
 * touches the table. Two channels: narrator (the ElevenLabs read-aloud voice)
 * and ambiance (the looping Suno scores), each with a level and a mute, plus a
 * master mute for a fast "silence everything."
 *
 * Persisted to localStorage so a device remembers its mix. Deliberately not a
 * React context: audio players live in many places (the Present overlay, a
 * future ambience player), and a module store keeps them all in sync with no
 * provider to thread. Sources multiply their element volume by level(channel).
 */

export type AudioChannel = "narrator" | "ambiance";

export interface AudioSettings {
  narratorVol: number; // 0–1
  narratorMuted: boolean;
  ambianceVol: number;
  ambianceMuted: boolean;
  masterMuted: boolean;
}

const KEY = "vtt:audio";
const DEFAULTS: AudioSettings = {
  narratorVol: 0.9,
  narratorMuted: false,
  ambianceVol: 0.5, // ambience sits under everything by default
  ambianceMuted: false,
  masterMuted: false,
};

let state: AudioSettings = load();
const listeners = new Set<() => void>();

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AudioSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore private-mode / quota */
  }
}

export const audioBus = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  set(patch: Partial<AudioSettings>) {
    state = { ...state, ...patch };
    persist();
    listeners.forEach((fn) => fn());
  },
  /** The effective 0–1 gain for a channel — 0 when muted (channel or master). */
  level(channel: AudioChannel): number {
    if (state.masterMuted) return 0;
    if (channel === "narrator") return state.narratorMuted ? 0 : state.narratorVol;
    return state.ambianceMuted ? 0 : state.ambianceVol;
  },
};

/** React binding — re-renders on any mix change. */
export const useAudioSettings = (): AudioSettings =>
  useSyncExternalStore(audioBus.subscribe, audioBus.get, audioBus.get);
