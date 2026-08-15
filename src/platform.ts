import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { platform as osPlatform } from "node:os";

// Fork note: added "win" for native Windows support (original upstream only
// covers mac / linux / wsl).
export type Platform = "mac" | "linux" | "wsl" | "win" | "unknown";

export function detectPlatform(): Platform {
  const p = osPlatform();
  if (p === "darwin") return "mac";
  if (p === "win32") return "win";
  if (p === "linux") {
    try {
      const version = readFileSync("/proc/version", "utf8");
      if (/microsoft/i.test(version)) return "wsl";
    } catch {}
    return "linux";
  }
  return "unknown";
}

let cachedLinuxPlayer: string | null | undefined;

export function detectLinuxPlayer(): string | null {
  if (cachedLinuxPlayer !== undefined) return cachedLinuxPlayer;
  for (const cmd of ["pw-play", "paplay", "ffplay", "mpv", "play", "aplay"]) {
    try {
      execSync(`command -v ${cmd}`, { stdio: "pipe" });
      cachedLinuxPlayer = cmd;
      return cmd;
    } catch {}
  }
  cachedLinuxPlayer = null;
  return null;
}

// Fork addition: on Windows/WSH, prefer PowerShell 7 (`pwsh`) if installed,
// falling back to Windows PowerShell (`powershell.exe`). Returns the binary
// name suitable for `spawn()`.
let cachedPwshBin: string | null | undefined;

export function detectPwshBin(): string | null {
  if (cachedPwshBin !== undefined) return cachedPwshBin;
  // `pwsh` is cross-platform PowerShell 7; available on Windows if the user
  // installed it. `powershell.exe` is Windows-only Windows PowerShell 5.1.
  for (const bin of ["pwsh", "pwsh.exe", "powershell", "powershell.exe"]) {
    try {
      // `command -v` works in git-bash / WSL; on native Windows we use `where`.
      const checker = process.platform === "win32" ? `where ${bin}` : `command -v ${bin}`;
      execSync(checker, { stdio: "pipe" });
      cachedPwshBin = bin;
      return bin;
    } catch {}
  }
  cachedPwshBin = null;
  return null;
}

// Fork addition: detect a CLI audio player on Windows that supports volume
// control. Priority: ffplay > mpv. Returns null if neither is installed,
// in which case callers fall back to winmm.dll PlaySound (no volume control,
// but works without external dependencies).
let cachedWinPlayer: string | null | undefined;

export function detectWindowsPlayer(): string | null {
  if (cachedWinPlayer !== undefined) return cachedWinPlayer;
  for (const cmd of ["ffplay", "mpv"]) {
    try {
      const checker = process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`;
      execSync(checker, { stdio: "pipe" });
      cachedWinPlayer = cmd;
      return cmd;
    } catch {}
  }
  cachedWinPlayer = null;
  return null;
}
