export interface SoundEntry {
  file: string;
  label?: string;
}

export interface PackManifest {
  name: string;
  display_name?: string;
  categories: Record<string, { sounds: SoundEntry[] }>;
}

export type RelayMode = "auto" | "local" | "relay";
export interface PeonConfig {
  default_pack: string;
  volume: number;
  enabled: boolean;
  desktop_notifications: boolean;
  categories: Record<string, boolean>;
  // dsh port: play a sound when an individual tool call fails. Defaults to
  // false — by default only whole-task completion (`task.complete`) and
  // unexpected task termination (`task.error` on a failed/aborted turn) beep.
  tool_error_sounds: boolean;
  annoyed_threshold: number;
  annoyed_window_seconds: number;
  silent_window_seconds: number;
  relay_mode: RelayMode;
  // Fork addition: how long the PowerShell MediaPlayer process stays alive
  // after calling Play(). Lowering this reduces zombie-process buildup when
  // sounds trigger rapidly. Sound clips are typically 1–2s; default 2s.
  playback_wait_seconds: number;
}

export interface PeonState {
  paused: boolean;
  last_played: Record<string, string>;
  prompt_timestamps: number[];
  last_stop_time: number;
  session_start_time: number;
}

export interface RegistryPack {
  name: string;
  source_repo?: string;
  source_ref?: string;
  source_path?: string;
}

export interface Registry {
  packs: RegistryPack[];
}
