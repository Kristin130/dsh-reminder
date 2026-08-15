import { describe, it, expect } from "vitest";
import { detectPlatform, type Platform } from "../src/platform";
import { platform as osPlatform } from "node:os";

describe("detectPlatform", () => {
  it("returns a valid platform string", () => {
    const result = detectPlatform();
    const valid: Platform[] = ["mac", "linux", "wsl", "win", "unknown"];
    expect(valid).toContain(result);
  });

  it("matches the current os.platform()", () => {
    const result = detectPlatform();
    const p = osPlatform();

    if (p === "darwin") {
      expect(result).toBe("mac");
    } else if (p === "win32") {
      // Fork addition: native Windows returns "win".
      expect(result).toBe("win");
    } else if (p === "linux") {
      // Could be "linux" or "wsl"
      expect(["linux", "wsl"]).toContain(result);
    } else {
      expect(result).toBe("unknown");
    }
  });
});
