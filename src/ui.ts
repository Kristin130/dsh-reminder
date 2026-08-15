/**
 * peon-ping settings surface for the DeepSeek Harness port.
 *
 * The pi plugin opened a TUI settings panel (`/peon`) and a TUI install
 * panel (`/peon install`). The Harness web GUI has no TUI, so this module
 * provides the same settings as slash-command output and subcommands:
 *
 *   /peon                      — current status (pack, volume, toggles, relay)
 *   /peon install [packs...]   — download sound packs
 *   /peon pack <name>          — switch the active sound pack
 *   /peon volume <0-100>       — set volume percent
 *   /peon toggle <category>    — enable/disable one sound category
 *   /peon pause | resume       — pause/resume all sounds
 *   /peon notify on|off        — toggle desktop notifications
 *   /peon silent <seconds>     — suppress task.complete for short tasks
 *   /peon relay auto|local|relay — relay mode
 *   /peon preview              — play the active pack's session.start sound
 *   /peon help                 — this help
 *
 * Config and state remain in the same `~/.config/peon-ping/` files the pi
 * plugin uses, so packs and settings are shared between pi and dsh.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { killPreviousSound, playSound } from "./audio.ts";
import { loadConfig, loadState, saveConfig, saveState } from "./config.ts";
import { CATEGORY_LABELS, DEFAULT_PACK_NAMES, VOLUME_STEPS } from "./constants.ts";
import { downloadPack, fetchRegistry, getPacksDir, listPacks, loadManifest, pickSound } from "./packs.ts";
import { detectRemoteSession, getRelayUrl } from "./relay.ts";
import type { PeonConfig, PeonState, RelayMode } from "./types.ts";

export interface InstallReport {
  installed: number;
  total: number;
  failed: string[];
  cancelled: boolean;
}

/** Build the `/peon` status text (mirrors the pi settings panel's contents). */
export function buildStatusText(): string {
  const config = loadConfig();
  const state = loadState();
  const packs = listPacks();
  const activePack = packs.find((p) => p.name === config.default_pack);
  const session = detectRemoteSession();
  const relayUrl = getRelayUrl(config.relay_mode);

  const lines: string[] = [
    "peon-ping settings",
    "-----------------",
    `Sounds:          ${state.paused ? "paused" : "active"}`,
    `Sound pack:      ${activePack?.displayName || config.default_pack} (${packs.length} installed)`,
    `Volume:          ${Math.round(config.volume * 100)}%`,
    `Notifications:   ${config.desktop_notifications ? "on" : "off"}`,
    `Tool error beep: ${config.tool_error_sounds ? "on" : "off"} (default off)`,
    `Silent window:   ${config.silent_window_seconds}s`,
    `Relay mode:      ${config.relay_mode}${
      relayUrl ? ` → ${relayUrl}${session ? ` (${session.type})` : ""}` : ""
    }`,
  ];

  for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
    lines.push(`  ${label.padEnd(24)} ${config.categories[cat] !== false ? "on" : "off"}`);
  }

  lines.push(
    "",
    "Subcommands: install [packs...], pack <name>, volume <0-100>, toggle <category>,",
    "pause, resume, notify on|off, tool-error on|off, silent <seconds>, relay auto|local|relay, preview, help",
  );
  return lines.join("\n");
}

/** Download packs; `onProgress` receives one-line updates for the command result. */
export async function runInstall(
  packNames: string[],
  onProgress: (msg: string) => void,
  isCancelled: () => boolean = () => false,
): Promise<InstallReport> {
  const registry = await fetchRegistry();
  const names = packNames.length > 0 ? packNames : DEFAULT_PACK_NAMES;

  let installed = 0;
  const failed: string[] = [];

  for (let i = 0; i < names.length; i++) {
    if (isCancelled()) break;
    const name = names[i]!;
    onProgress(`[${i + 1}/${names.length}] ${name}: downloading...`);
    const ok = await downloadPack(name, registry, (msg) => onProgress(`[${i + 1}/${names.length}] ${msg}`));
    if (ok) installed++;
    else failed.push(name);
  }

  if (installed > 0) {
    const config = loadConfig();
    if (!listPacks().find((p) => p.name === config.default_pack)) {
      config.default_pack = names[0]!;
      saveConfig(config);
    }
  }

  return { installed, total: names.length, failed, cancelled: isCancelled() };
}

/** Apply one `/peon` settings mutation; returns a human-readable outcome. */
export function applySetting(args: string): { ok: boolean; text: string } {
  const [verb, ...rest] = args.trim().split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (verb) {
    case "volume": {
      const value = parseInt(arg, 10);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return { ok: false, text: "Usage: /peon volume <0-100>" };
      }
      const config = loadConfig();
      config.volume = value / 100;
      saveConfig(config);
      return { ok: true, text: `Volume set to ${value}%.` };
    }
    case "pack": {
      const packs = listPacks();
      if (!arg) {
        return { ok: false, text: `Usage: /peon pack <name>. Installed: ${packs.map((p) => p.name).join(", ") || "none (run /peon install)"}` };
      }
      const pack = packs.find((p) => p.name === arg);
      if (!pack) {
        return { ok: false, text: `Pack "${arg}" not installed. Installed: ${packs.map((p) => p.name).join(", ") || "none (run /peon install)"}` };
      }
      const config = loadConfig();
      config.default_pack = pack.name;
      saveConfig(config);
      return { ok: true, text: `Active sound pack: ${pack.displayName}.` };
    }
    case "toggle": {
      if (!arg || !(arg in CATEGORY_LABELS)) {
        return { ok: false, text: `Usage: /peon toggle <category>. Categories: ${Object.keys(CATEGORY_LABELS).join(", ")}` };
      }
      const config = loadConfig();
      config.categories[arg] = config.categories[arg] === false;
      saveConfig(config);
      return { ok: true, text: `${CATEGORY_LABELS[arg]} is now ${config.categories[arg] ? "on" : "off"}.` };
    }
    case "pause":
    case "resume": {
      const state = loadState();
      state.paused = verb === "pause";
      saveState(state);
      return { ok: true, text: verb === "pause" ? "Sounds paused." : "Sounds resumed." };
    }
    case "notify": {
      if (arg !== "on" && arg !== "off") return { ok: false, text: "Usage: /peon notify on|off" };
      const config = loadConfig();
      config.desktop_notifications = arg === "on";
      saveConfig(config);
      return { ok: true, text: `Desktop notifications ${arg === "on" ? "enabled" : "disabled"}.` };
    }
    case "tool-error": {
      if (arg !== "on" && arg !== "off") return { ok: false, text: "Usage: /peon tool-error on|off" };
      const config = loadConfig();
      config.tool_error_sounds = arg === "on";
      saveConfig(config);
      return { ok: true, text: `Tool error beep ${arg === "on" ? "enabled" : "disabled"}.` };
    }
    case "silent": {
      const value = parseInt(arg, 10);
      if (!Number.isFinite(value) || value < 0) return { ok: false, text: "Usage: /peon silent <seconds>" };
      const config = loadConfig();
      config.silent_window_seconds = value;
      saveConfig(config);
      return { ok: true, text: `Silent window set to ${value}s.` };
    }
    case "relay": {
      if (arg !== "auto" && arg !== "local" && arg !== "relay") {
        return { ok: false, text: "Usage: /peon relay auto|local|relay" };
      }
      const config = loadConfig();
      config.relay_mode = arg as RelayMode;
      saveConfig(config);
      return { ok: true, text: `Relay mode set to "${arg}".` };
    }
    case "preview": {
      const config = loadConfig();
      const state = loadState();
      const sound = pickSound("session.start", config, state);
      if (!sound) return { ok: false, text: "No preview sound available (install packs first)." };
      playSound(sound.file, config.volume);
      saveState(state);
      return { ok: true, text: `Previewing ${sound.label}.` };
    }
    case "install": {
      return { ok: false, text: "Use /peon install [packs...]" };
    }
    default:
      return { ok: false, text: `Unknown setting "${verb}". Run /peon help.` };
  }
}

/** Preview the sound of one pack as the settings panel scroll did in pi. */
export function previewPackSound(packName: string): string | null {
  const packsDir = getPacksDir();
  const packPath = join(packsDir, packName);
  const manifest = loadManifest(packPath);
  if (!manifest) return null;

  const cat = manifest.categories["session.start"] || Object.values(manifest.categories)[0];
  if (!cat?.sounds?.length) return null;

  const pick = cat.sounds[Math.floor(Math.random() * cat.sounds.length)]!;
  const file = pick.file.includes("/")
    ? join(packPath, pick.file)
    : join(packPath, "sounds", pick.file);

  if (!existsSync(file)) return null;
  const cfg = loadConfig();
  killPreviousSound();
  playSound(file, cfg.volume);
  return pick.label || file;
}

/** Volume step list kept for API parity with the pi settings panel. */
export function volumeSteps(): string[] {
  return VOLUME_STEPS;
}

export type { PeonConfig, PeonState };
