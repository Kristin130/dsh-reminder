# dsh-reminder

> peon-ping sound notifications for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) — a **faithful port** of the pi plugin [`pi-peon-ping-win`](https://github.com/Gohan/pi-peon-ping-win).

Plays themed audio clips (Warcraft III Peon, GLaDOS, Duke Nukem, StarCraft, …) on lifecycle events using [OpenPeon](https://github.com/PeonPing/og-packs) sound packs, and shows desktop notifications — with native Windows support (three-tier audio fallback `ffplay` → `mpv` → `winmm.dll PlaySound`, custom WinForms popup).

## Acknowledgments

This project is a **port**, not an original work. All credit for the underlying functionality goes to:

- **[pi-peon-ping](https://github.com/joshuadavidthomas/pi-peon-ping)** by [Josh Thomas](https://github.com/joshuadavidthomas) — the original peon-ping extension for the pi coding agent.
- **[pi-peon-ping-win](https://github.com/Gohan/pi-peon-ping-win)** by [cppgohan](https://github.com/Gohan) — the fork that added native Windows support (audio fallback, WinForms popup, event-aware notifications).
- **[peon-ping](https://github.com/PeonPing/peon-ping)** and the [OpenPeon](https://github.com/PeonPing/og-packs) sound packs / registry.

Thank you to all of them for the original work and the MIT license that makes this port possible.

## Features

| Event | Sound category | Desktop notification | Default sound |
|-------|---------------|----------------------|---------------|
| Session start | `session.start` — "Ready to work?" | — | off |
| Agent starts working | `task.acknowledge` — "Work, work." | — | off |
| Individual tool failure | `task.error` — error sound | `error` — body names the failing tool | off |
| Rapid prompts (≥3 in 10s) | `user.spam` — annoyed voice line | — | off |
| **Task completes** | `task.complete` — completion sound | `done` — body shows the assistant's last response (truncated) | **on** |
| **Task terminates unexpectedly** (error / cancelled / blocked / token limit) | `task.error` — error sound | `error` — body names the failure | **on** |
| Context compaction | `resource.limit` — limit sound | `compacted` — body: "Context compacted" | off |

**dsh port default: the harness stays quiet — only a task **completing** or **terminating unexpectedly** beeps.** Everything else (session start, per-prompt ack, spam, individual tool errors, compaction) is off by default and can be re-enabled with `/peon toggle <category>` (tool errors with `/peon tool-error on`).

This is the same feature table as the pi plugin; only the host and the default on/off set changed. The event mapping:

| pi event | dsh event |
|----------|-----------|
| `session_start` | `session/created` (top-level sessions) |
| `before_agent_start` | `user/message` (kind `user`) |
| `agent_start` | `turn/start` |
| `tool_execution_end` (error) | `tool/result` with `isError` |
| `agent_end` | `turn/end` |
| `session_compact` | `compaction/end` (fires **after** compaction completes) |

## Requirements

- DeepSeek Harness (any profile — the plugin is installed as a profile bundle)
- An audio player on your system (see Platform support below). On Windows, `winget install Gyan.FFmpeg` for the best experience.

## Installation (npm)

Install as a profile plugin:

```bash
dsh plugin --profile web add dsh-reminder
```

Restart the harness (or reload the profile) so the new bundle layer mounts. The bundle patch (`cordis.patch.yml`) inserts the `peon-ping` plugin row automatically — no manual `cordis.patch.yml` editing.

To install from a local checkout:

```bash
dsh plugin --profile web add D:/1codeprojects/dsh-plugins/dsh-reminder
```

To uninstall:

```bash
dsh plugin --profile web remove dsh-reminder
```

## Usage

On first run the plugin logs a reminder to install sound packs. Run:

```
/peon install
```

to download the 10 default packs from the [peon-ping registry](https://peonping.github.io/registry/). To install specific packs:

```
/peon install peon_ru
/peon install peon_ru glados duke_nukem
```

Settings (the pi `/peon` TUI panel is replaced by slash-command output, since the Harness web GUI has no TUI):

```
/peon                      — current settings
/peon install [packs...]   — download sound packs
/peon pack <name>          — switch the active pack
/peon volume <0-100>       — set volume percent
/peon toggle <category>    — enable/disable one sound category
/peon pause | resume       — pause/resume all sounds
/peon notify on|off        — toggle desktop notifications
/peon tool-error on|off    — beep on individual tool failures (default off)
/peon silent <seconds>     — suppress task.complete for short tasks
/peon relay auto|local|relay
/peon preview              — play the session.start sound
/peon help
```

## Platform support

| Platform | Player |
|----------|--------|
| macOS | `afplay` (built-in) |
| Linux | `pw-play`, `paplay`, `ffplay`, `mpv`, `play`, or `aplay` (first found) |
| WSL | PowerShell `MediaPlayer` |
| **Windows (native)** ⭐ | `ffplay` (recommended, `winget install Gyan.FFmpeg`) → `mpv` → `winmm.dll PlaySound` fallback (no volume control) |

## Config and data

Config, state, and packs live in the **same** files the pi plugin uses, so a machine that already ran pi-peon-ping keeps its packs and settings:

- `~/.config/peon-ping/config.json`
- `~/.config/peon-ping/state.json`
- `~/.config/peon-ping/packs/`

| Option | Default | Description |
|--------|---------|-------------|
| `default_pack` | `"peon"` | Active sound pack |
| `volume` | `1.0` | Sound volume (0.0–1.0) |
| `enabled` | `true` | Master on/off switch |
| `desktop_notifications` | `true` | Show system notifications on task complete |
| `categories` | `task.complete` + `task.error` on, rest off | Per-event sound toggles (see the feature table) |
| `tool_error_sounds` | `false` | Beep when an individual tool call fails |
| `silent_window_seconds` | `0` | Suppress `task.complete` for tasks shorter than N seconds |
| `annoyed_threshold` | `3` | Number of rapid prompts to trigger spam detection |
| `annoyed_window_seconds` | `10` | Time window for spam detection |
| `relay_mode` | `"auto"` | Relay mode: `"auto"`, `"local"`, or `"relay"` |
| `playback_wait_seconds` | `2` | Seconds the PowerShell player process stays alive after `Play()` |

Legacy config with `active_pack` is migrated to `default_pack` on load. Packs are also picked up from `~/.claude/hooks/peon-ping/packs` (Claude Code).

## Remote development

The extension auto-detects SSH sessions, devcontainers, and Codespaces, and routes audio through the peon-ping relay running on your local machine (see the [peon-ping remote development docs](https://github.com/PeonPing/peon-ping#remote-development-ssh--devcontainers--codespaces)). Configure with `/peon relay`.

## Development

```bash
npm install
npm test              # run tests
npm run typecheck     # type check
npm run build         # build lib/
npm run publish:dry-run  # verify the npm package contents
```

## License

MIT. All credit for the original work goes to [joshuadavidthomas](https://github.com/joshuadavidthomas) (pi-peon-ping) and [cppgohan](https://github.com/Gohan) (pi-peon-ping-win, native Windows support).
