import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Redirect peon-ping data dirs to a temp dir for this suite.
const tempDir = join(tmpdir(), `peon-ping-ui-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
vi.mock("../src/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/constants")>();
  return {
    ...actual,
    DATA_DIR: tempDir,
    PACKS_DIR: join(tempDir, "packs"),
    CONFIG_PATH: join(tempDir, "config.json"),
    STATE_PATH: join(tempDir, "state.json"),
    LEGACY_PACKS: join(tempDir, "legacy-packs"),
  };
});

describe("ui settings commands", () => {
  beforeEach(() => {
    mkdirSync(join(tempDir, "packs"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("buildStatusText includes key settings", async () => {
    const { buildStatusText } = await import("../src/ui");
    const text = buildStatusText();
    expect(text).toContain("peon-ping settings");
    expect(text).toContain("Sounds:");
    expect(text).toContain("Sound pack:");
    expect(text).toContain("Volume:");
    expect(text).toContain("Silent window:");
  });

  it("applySetting volume clamps to percent", async () => {
    const { applySetting } = await import("../src/ui");
    const { loadConfig } = await import("../src/config");

    const ok = applySetting("volume 42");
    expect(ok.ok).toBe(true);
    expect(loadConfig().volume).toBe(0.42);
  });

  it("applySetting rejects out-of-range volume", async () => {
    const { applySetting } = await import("../src/ui");
    const result = applySetting("volume 150");
    expect(result.ok).toBe(false);
  });

  it("applySetting pause and resume persist state", async () => {
    const { applySetting } = await import("../src/ui");
    const { loadState } = await import("../src/config");

    expect(applySetting("pause").ok).toBe(true);
    expect(loadState().paused).toBe(true);
    expect(applySetting("resume").ok).toBe(true);
    expect(loadState().paused).toBe(false);
  });

  it("applySetting toggle flips a category", async () => {
    const { applySetting } = await import("../src/ui");
    const { loadConfig } = await import("../src/config");

    const before = loadConfig().categories["user.spam"];
    expect(applySetting("toggle user.spam").ok).toBe(true);
    expect(loadConfig().categories["user.spam"]).toBe(!before);
    expect(applySetting("toggle user.spam").ok).toBe(true);
    expect(loadConfig().categories["user.spam"]).toBe(before);
  });

  it("applySetting notify off persists", async () => {
    const { applySetting } = await import("../src/ui");
    const { loadConfig } = await import("../src/config");

    expect(applySetting("notify off").ok).toBe(true);
    expect(loadConfig().desktop_notifications).toBe(false);
  });

  it("applySetting tool-error toggles tool_error_sounds", async () => {
    const { applySetting } = await import("../src/ui");
    const { loadConfig } = await import("../src/config");

    expect(applySetting("tool-error on").ok).toBe(true);
    expect(loadConfig().tool_error_sounds).toBe(true);
    expect(applySetting("tool-error off").ok).toBe(true);
    expect(loadConfig().tool_error_sounds).toBe(false);
    expect(applySetting("tool-error maybe").ok).toBe(false);
  });

  it("applySetting rejects unknown settings", async () => {
    const { applySetting } = await import("../src/ui");
    const result = applySetting("frobnicate");
    expect(result.ok).toBe(false);
  });
});
