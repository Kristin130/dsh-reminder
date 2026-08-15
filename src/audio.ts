import { spawn } from "node:child_process";
import { join } from "node:path";
import { detectLinuxPlayer, detectPlatform, detectPwshBin, detectWindowsPlayer, type Platform } from "./platform.ts";
import { saveState } from "./config.ts";
import { resolveIcon, sendDesktopNotification, type NotifyOptions } from "./notification.ts";
import type { NotifyStatus } from "./notify-content.ts";
import { getPacksDir, pickSound } from "./packs.ts";
import { getRelayUrl, relayPlayCategory, relayNotify } from "./relay.ts";
import type { PeonConfig, PeonState } from "./types.ts";

const PLATFORM: Platform = detectPlatform();

let currentSoundPid: number | null = null;

export function killPreviousSound(): void {
  if (currentSoundPid !== null) {
    try {
      process.kill(currentSoundPid);
    } catch {}
    currentSoundPid = null;
  }
}

function pct(volume: number): number {
  return Math.max(0, Math.min(100, Math.round(volume * 100)));
}

export function playSound(file: string, volume: number, waitSeconds = 2): void {
  killPreviousSound();

  let child;

  switch (PLATFORM) {
    case "mac":
      child = spawn("afplay", ["-v", String(volume), file], {
        stdio: "ignore",
        detached: true,
      });
      break;

    case "win": {
      // Fork note: native Windows. Try ffplay / mpv first (volume-capable,
      // also used by the linux branch for symmetry), then fall back to
      // winmm.dll PlaySound via PowerShell P/Invoke (no external deps but
      // no volume control either).
      //
      // Why not WPF MediaPlayer like upstream WSL? Because MediaPlayer
      // silently fails to render audio in a `-NonInteractive -Command`
      // background process — there's no WPF Dispatcher message pump.
      const winPlayer = detectWindowsPlayer();

      if (winPlayer === "ffplay") {
        child = spawn("ffplay", ["-nodisp", "-autoexit", "-volume", String(pct(volume)), file], {
          stdio: "ignore", detached: true,
        });
        break;
      }

      if (winPlayer === "mpv") {
        child = spawn("mpv", ["--no-video", `--volume=${pct(volume)}`, file], {
          stdio: "ignore", detached: true,
        });
        break;
      }

      // Fallback: winmm.dll PlaySound. Synchronous (SND_SYNC), blocks until
      // the wav finishes. `volume` and `waitSeconds` are ignored here —
      // install ffplay (`winget install Gyan.FFmpeg`) or mpv for volume.
      const psBin = detectPwshBin() ?? "powershell.exe";
      const winPath = file.replace(/\//g, "\\");
      const cmd = `
        Add-Type -TypeDefinition @'
        using System.Runtime.InteropServices;
        public class WinMm {
          [DllImport("winmm.dll", SetLastError=true, CharSet=CharSet.Auto)]
          public static extern bool PlaySound(string lpszName, System.IntPtr hModule, uint fdwSound);
        }
'@
        # SND_FILENAME = 0x00020000, SND_SYNC = 0x0000 (default)
        [WinMm]::PlaySound('${winPath.replace(/\\/g, "\\\\")}', [IntPtr]::Zero, 0x00020000) | Out-Null
      `;
      child = spawn(psBin, ["-NoProfile", "-NonInteractive", "-Command", cmd], {
        stdio: "ignore",
        detached: true,
      });
      break;
    }

    case "wsl": {
      // Upstream code path, unchanged.
      const psBin = detectPwshBin() ?? "powershell.exe";
      const cmd = `
        Add-Type -AssemblyName PresentationCore
        $p = New-Object System.Windows.Media.MediaPlayer
        $p.Open([Uri]::new('file:///${file.replace(/\//g, "\\")}'))
        $p.Volume = ${volume}
        Start-Sleep -Milliseconds 200
        $p.Play()
        Start-Sleep -Seconds ${waitSeconds}
        $p.Close()
      `;
      child = spawn(psBin, ["-NoProfile", "-NonInteractive", "-Command", cmd], {
        stdio: "ignore",
        detached: true,
      });
      break;
    }

    case "linux": {
      const player = detectLinuxPlayer();
      if (!player) return;

      switch (player) {
        case "pw-play":
          child = spawn("pw-play", ["--volume", String(volume), file], {
            stdio: "ignore", detached: true,
          });
          break;
        case "paplay": {
          const paVol = Math.max(0, Math.min(65536, Math.round(volume * 65536)));
          child = spawn("paplay", [`--volume=${paVol}`, file], {
            stdio: "ignore", detached: true,
          });
          break;
        }
        case "ffplay": {
          child = spawn("ffplay", ["-nodisp", "-autoexit", "-volume", String(pct(volume)), file], {
            stdio: "ignore", detached: true,
          });
          break;
        }
        case "mpv": {
          child = spawn("mpv", ["--no-video", `--volume=${pct(volume)}`, file], {
            stdio: "ignore", detached: true,
          });
          break;
        }
        case "play":
          child = spawn("play", ["-v", String(volume), file], {
            stdio: "ignore", detached: true,
          });
          break;
        case "aplay":
          child = spawn("aplay", ["-q", file], {
            stdio: "ignore", detached: true,
          });
          break;
      }
      break;
    }
  }

  if (child) {
    child.unref();
    currentSoundPid = child.pid ?? null;
    child.on("exit", () => {
      if (currentSoundPid === child.pid) currentSoundPid = null;
    });
  }
}

export type UiNotify = (message: string, type?: "info" | "warning" | "error") => void;

export function sendNotification(
  title: string,
  body: string,
  config: PeonConfig,
  uiNotify?: UiNotify,
  status?: NotifyStatus,
  promptLine?: string,
): void {
  if (!config.desktop_notifications) return;

  const relayUrl = getRelayUrl(config.relay_mode);
  if (relayUrl) {
    relayNotify(relayUrl, title, body).catch(() => {});
    return;
  }

  const packPath = join(getPacksDir(), config.default_pack);
  const iconPath = resolveIcon(packPath);
  const options: NotifyOptions = {
    iconPath,
    ...(status !== undefined ? { status } : {}),
    ...(promptLine !== undefined ? { promptLine } : {}),
  };
  const sent = sendDesktopNotification(title, body, options);
  if (!sent && uiNotify) {
    uiNotify(`${title}: ${body}`, "info");
  }
}

export function playCategorySound(category: string, config: PeonConfig, state: PeonState): void {
  if (!config.enabled || state.paused) return;
  if (!config.categories[category]) return;

  const relayUrl = getRelayUrl(config.relay_mode);
  if (relayUrl) {
    relayPlayCategory(relayUrl, category).catch(() => {});
    return;
  }

  const sound = pickSound(category, config, state);
  if (sound) {
    playSound(sound.file, config.volume, config.playback_wait_seconds);
    saveState(state);
  }
}
