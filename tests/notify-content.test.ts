import { describe, it, expect } from "vitest";
import {
  buildNotifyContent,
  extractLastAssistantText,
  extractToolErrorText,
  resolveProjectName,
} from "../src/notify-content";

describe("resolveProjectName", () => {
  it("prefers the session name over folder name", () => {
    expect(resolveProjectName("C:\\some\\project", "My Session")).toBe("My Session");
  });

  it("falls back to the folder name", () => {
    expect(resolveProjectName("C:\\some\\project")).toBe("project");
  });

  it("sanitizes invalid characters", () => {
    expect(resolveProjectName("C:\\some\\pro*ject<>")).toBe("project");
  });
});

describe("extractLastAssistantText (dsh session events)", () => {
  it("returns the last assistant text message", () => {
    const events = [
      { type: "user/message", seq: 0, time: 0, data: { role: "user", id: "u", source: { kind: "user" }, content: [{ type: "text", text: "hi" }] } },
      { type: "assistant/message", seq: 1, time: 1, data: { turn: 1, step: 1, message: { role: "assistant", id: "a1", source: { kind: "model", provider: "p", model: "m" }, content: [{ type: "text", text: "First response" }] } } },
      { type: "assistant/message", seq: 2, time: 2, data: { turn: 1, step: 2, message: { role: "assistant", id: "a2", source: { kind: "model", provider: "p", model: "m" }, content: [{ type: "text", text: "Second response" }] } } },
    ] as any[];

    expect(extractLastAssistantText(events)).toBe("Second response");
  });

  it("skips tool-call-only turns", () => {
    const events = [
      { type: "assistant/message", seq: 0, time: 0, data: { turn: 1, step: 1, message: { role: "assistant", id: "a1", source: { kind: "model", provider: "p", model: "m" }, content: [{ type: "tool-call", id: "c", name: "bash", arguments: "{}" }] } } },
    ] as any[];

    expect(extractLastAssistantText(events)).toBe("");
  });

  it("truncates long text", () => {
    const long = "word ".repeat(50);
    const events = [
      { type: "assistant/message", seq: 0, time: 0, data: { turn: 1, step: 1, message: { role: "assistant", id: "a1", source: { kind: "model", provider: "p", model: "m" }, content: [{ type: "text", text: long }] } } },
    ] as any[];

    const result = extractLastAssistantText(events);
    expect(result.length).toBeLessThan(long.length);
    expect(result.endsWith("…")).toBe(true);
  });

  it("returns empty for undefined events", () => {
    expect(extractLastAssistantText(undefined)).toBe("");
  });
});

describe("extractToolErrorText", () => {
  it("extracts text from a tool-result block", () => {
    const block = {
      type: "tool-result",
      toolCallId: "c-1",
      content: [{ type: "text", text: "stdout\nstderr" }],
      isError: true,
    };
    const result = extractToolErrorText(block);
    expect(result).toContain("stdout");
    expect(result).toContain("stderr");
  });

  it("returns empty when no text blocks", () => {
    const block = { type: "tool-result", toolCallId: "c-2", content: [], isError: true };
    expect(extractToolErrorText(block)).toBe("");
  });

  it("returns empty for non-object input", () => {
    expect(extractToolErrorText(null)).toBe("");
    expect(extractToolErrorText("oops")).toBe("");
  });
});

describe("buildNotifyContent", () => {
  it("builds done content with a summary override", () => {
    const { title, body, status } = buildNotifyContent("done", "project", "Done!");
    expect(title).toBe("project · done");
    expect(body).toBe("Done!");
    expect(status).toBe("done");
  });

  it("builds done content with fallback text", () => {
    const { body } = buildNotifyContent("done", "project");
    expect(body).toBe("Task complete");
  });

  it("builds error content", () => {
    const { title, body } = buildNotifyContent("error", "project", "[bash]: failed");
    expect(title).toBe("project · error");
    expect(body).toBe("[bash]: failed");
  });

  it("builds compacted content", () => {
    const { title, body } = buildNotifyContent("compacted", "project");
    expect(title).toBe("project · compacted");
    expect(body).toBe("Context compacted");
  });
});
