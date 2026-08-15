import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_CONFIG, DEFAULT_STATE } from "../src/constants";

// Mock the audio + config modules so this suite never spawns processes and
// never touches the real ~/.config/peon-ping files. This file is the only one
// mocking ../src/config; the plugin-level tests here exercise the default
// sound routing ("beep only on task complete and unexpected termination").
const mockPlay = vi.fn();
const mockNotify = vi.fn();
const mockSaveState = vi.fn();

vi.mock("../src/audio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/audio")>();
  return { ...actual, playCategorySound: mockPlay, sendNotification: mockNotify };
});

vi.mock("../src/config", () => ({
  ensureDirs: () => {},
  migrateConfig: (raw: Record<string, any>) => raw,
  // relay_mode 'relay' makes shouldPlaySounds() true without real packs.
  loadConfig: () => ({ ...DEFAULT_CONFIG, relay_mode: "relay" }),
  loadState: () => ({ ...DEFAULT_STATE }),
  saveConfig: () => {},
  saveState: mockSaveState,
}));

function makeSession(events: unknown[] = []) {
  return {
    id: "s-turn",
    header: { id: "s-turn", version: 0, createdAt: Date.now(), cwd: process.cwd() },
    events,
    get surface() { return {}; },
  };
}

describe("default sound routing (dsh port)", () => {
  let listeners: Record<string, Function[]>;
  let stubCtx: any;

  beforeEach(async () => {
    mockPlay.mockClear();
    mockNotify.mockClear();
    mockSaveState.mockClear();
    listeners = {};
    stubCtx = {
      on: (name: string, handler: Function) => {
        (listeners[name] ??= []).push(handler);
        return () => {};
      },
      get: () => undefined,
      logger: { warn: () => {}, info: () => {}, error: () => {} },
    };
    const { apply } = await import("../index");
    apply(stubCtx);
  });

  it("turn/end completed plays task.complete and notifies done", async () => {
    const session = makeSession();
    for (const handler of listeners["session/event"]!) {
      await handler(session, {
        type: "turn/end",
        seq: 1,
        time: 1,
        data: { turn: 1, reason: { kind: "completed" } },
      } as any);
    }
    expect(mockPlay).toHaveBeenCalledWith("task.complete", expect.anything(), expect.anything());
    const notifyCall = mockNotify.mock.calls.find((c) => c[4] === "done");
    expect(notifyCall).toBeDefined();
  });

  it("turn/end error plays task.error and notifies error", async () => {
    const session = makeSession();
    for (const handler of listeners["session/event"]!) {
      await handler(session, {
        type: "turn/end",
        seq: 1,
        time: 1,
        data: { turn: 1, reason: { kind: "error", error: { message: "boom", code: "UNKNOWN" } } },
      } as any);
    }
    expect(mockPlay).toHaveBeenCalledWith("task.error", expect.anything(), expect.anything());
    const notifyCall = mockNotify.mock.calls.find((c) => c[4] === "error");
    expect(notifyCall).toBeDefined();
    // sendNotification(title, body, config, uiNotify, status, promptLine)
    expect(String(notifyCall![1])).toContain("Task failed: boom");
  });

  it("turn/end aborted plays task.error", async () => {
    const session = makeSession();
    for (const handler of listeners["session/event"]!) {
      await handler(session, {
        type: "turn/end",
        seq: 1,
        time: 1,
        data: { turn: 1, reason: { kind: "aborted", reason: { kind: "user" } } },
      } as any);
    }
    expect(mockPlay).toHaveBeenCalledWith("task.error", expect.anything(), expect.anything());
  });

  it("tool/result error stays silent by default (tool_error_sounds false)", async () => {
    const session = makeSession([{
      type: "tool/call",
      seq: 0,
      time: 0,
      data: { turn: 1, step: 1, callId: "c-1", name: "bash", arguments: "{}" },
    }]);
    for (const handler of listeners["session/event"]!) {
      await handler(session, {
        type: "tool/result",
        seq: 1,
        time: 1,
        data: {
          turn: 1,
          step: 1,
          message: {
            role: "user",
            id: "m-1",
            source: { kind: "tool", callId: "c-1" },
            content: [{ type: "tool-result", toolCallId: "c-1", content: [{ type: "text", text: "nope" }], isError: true }],
          },
        },
      } as any);
    }
    // No sound, but the desktop notification still fires.
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalled();
  });
});
