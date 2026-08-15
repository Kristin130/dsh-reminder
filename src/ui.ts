/**
 * Host-side pack management for the dsh-reminder port.
 *
 * The pi plugin's TUI panels became the web Settings page (client half of
 * this package); this module keeps the two host actions the page triggers
 * through the settings `_action` field: downloading packs and previewing a
 * sound. Config and state remain in the same `~/.config/peon-ping/` files the
 * pi plugin uses, so packs and settings are shared between pi and dsh.
 *
 * @module dsh-reminder/ui
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { killPreviousSound, playSound } from "./audio.ts";
import { loadConfig, saveConfig } from "./config.ts";
import { DEFAULT_PACK_NAMES } from "./constants.ts";
import { downloadPack, fetchRegistry, getPacksDir, listPacks, loadManifest } from "./packs.ts";
import type { PeonConfig, PeonState } from "./types.ts";

export interface InstallReport {
  installed: number;
  total: number;
  failed: string[];
  cancelled: boolean;
}

/** Download packs; `onProgress` receives one-line updates. */
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

/** Preview the session.start sound of one pack; returns a label or null. */
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

export type { PeonConfig, PeonState };
