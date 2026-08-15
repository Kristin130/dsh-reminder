/**
 * peon-ping for DeepSeek Harness — a faithful port of the pi plugin
 * `pi-peon-ping-win` (https://github.com/Gohan/pi-peon-ping-win).
 *
 * Plays themed audio clips from OpenPeon sound packs on lifecycle events and
 * shows desktop notifications. The pi event mapping:
 *
 *   pi `session_start`          → dsh `session/created` (top-level sessions)
 *   pi `before_agent_start`     → dsh `user/message` (kind 'user'; prompt capture)
 *   pi `agent_start`            → dsh `turn/start` (spam detection + ack)
 *   pi `tool_execution_end` err → dsh `tool/result` with isError
 *   pi `agent_end`              → dsh `turn/end` (task complete + summary popup)
 *   pi `session_compact`        → dsh `compaction/end` (fires AFTER compaction)
 *
 * The pi TUI settings/install panels move into the web GUI: the Settings
 * page (the client half of this package) reads and writes the `peon-ping`
 * settings namespace, placed right below "Agent Presets" in Settings.
 *
 * Config and state stay in `~/.config/peon-ping/` — the same files the pi
 * plugin uses — so packs and settings are shared between pi and dsh.
 *
 * @module dsh-reminder
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent, TurnEndReason } from '@deepseek-ai/dsh-session'
import { installSettingsSection } from '@deepseek-ai/dsh-settings'

// Type-level: merges `compaction/end` into the SessionEventMap vocabulary
// (mirrors @deepseek-ai/dsh-compaction/types; no runtime import).
import './src/compaction-events.ts'

import { playCategorySound, sendNotification } from './src/audio.ts'
import { ensureDirs, loadConfig, loadState, saveConfig, saveState } from './src/config.ts'
import { buildNotifyContent, extractLastAssistantText, extractToolErrorText, resolveProjectName } from './src/notify-content.ts'
import { listPacks } from './src/packs.ts'
import { checkRelayHealth, detectRemoteSession, getRelayUrl, relaySetupInstructions } from './src/relay.ts'
import { previewPackSound, runInstall } from './src/ui.ts'
import {
  buildSettingsEntry,
  configFromSettings,
  hasAction,
  parseAction,
  PEON_SETTINGS_NS,
  PEON_SETTINGS_SCHEMA,
  type PeonSettings,
} from './src/settings.ts'
import type { PeonConfig, PeonState } from './src/types.ts'

export const name = 'peon-ping'

/** Structural settings service (optional; the web Settings page surface). */
interface SettingsLike {
  update(ns: string, patch: object): Promise<void>
}

/** Structural session-title service (optional; popup project name). */
interface SessionTitleLike {
  get(session: Session): { title: string } | undefined
}

/** Text of one content-block array (user prompts). */
function blocksText(content: readonly unknown[] | undefined): string {
  if (!content || !Array.isArray(content)) return ''
  return content
    .filter((block): block is { type: 'text'; text: string } =>
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: string }).type === 'text')
    .map((block) => block.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whether a session is a top-level (non-subagent) session. */
function isTopLevel(session: Session): boolean {
  return session.header.delegationDepth === undefined
}

/** Look up the tool name for a `tool/result` by walking back to its `tool/call`. */
function toolNameFor(session: Session, callId: unknown): string {
  if (typeof callId !== 'string') return 'tool'
  for (let i = session.events.length - 1; i >= 0; i--) {
    const event = session.events[i]
    if (event?.type === 'tool/call' && String((event.data as { callId?: unknown }).callId) === callId) {
      const name = (event.data as { name?: unknown }).name
      return typeof name === 'string' ? name : 'tool'
    }
  }
  return 'tool'
}

/** Short human label for an unexpected turn end (popup body). */
function turnEndFailureLabel(reason: TurnEndReason): string {
  switch (reason.kind) {
    case 'aborted':
      return 'Task cancelled'
    case 'error': {
      const message = reason.error?.message
      return message !== undefined && message.length > 0 ? `Task failed: ${message}` : 'Task failed'
    }
    case 'blocked':
      return 'Task blocked'
    case 'max-tokens':
      return 'Task hit the token limit'
    case 'interrupted':
      return 'Task interrupted'
    default:
      return 'Task ended unexpectedly'
  }
}

export function apply(ctx: Context): void {
  ensureDirs()
  let config: PeonConfig = loadConfig()
  let state: PeonState = loadState()
  let installing = false

  // Per-session runtime facts (the pi plugin tracked these globally because
  // it had exactly one session per process; the harness hosts many).
  const sessionStartTimes = new WeakMap<Session, number>()
  const currentPrompts = new WeakMap<Session, string>()

  const hasPacks = () => listPacks().length > 0

  const shouldPlaySounds = () => {
    if (installing) return false
    const relayUrl = getRelayUrl(config.relay_mode)
    return relayUrl !== null || hasPacks()
  }

  const projectName = (session: Session): string => {
    const cwd = session.header.cwd ?? process.cwd()
    const titles = ctx.get('sessionTitle') as SessionTitleLike | undefined
    const snapshot = titles?.get(session)
    return resolveProjectName(cwd, snapshot?.title)
  }

  // pi `session_start` — a new top-level session entered the store.
  ctx.on('session/created', (session: Session) => {
    if (!isTopLevel(session)) return

    config = loadConfig()
    state = loadState()

    const relayUrl = getRelayUrl(config.relay_mode)
    if (relayUrl) {
      void checkRelayHealth(relayUrl).then((healthy) => {
        if (healthy) return
        const remote = detectRemoteSession()
        const instructions = remote
          ? relaySetupInstructions(remote)
          : `Ensure relay is running at ${relayUrl}`
        ctx.logger.warn(`peon-ping: relay unreachable at ${relayUrl}. ${instructions}`)
      })
    }

    if (!relayUrl && !hasPacks()) {
      ctx.logger.warn('peon-ping: no sound packs. Run /peon install')
      return
    }

    const now = Date.now()
    sessionStartTimes.set(session, now)
    state.session_start_time = now
    state.prompt_timestamps = []
    saveState(state)

    playCategorySound('session.start', config, state)
  })

  // pi `before_agent_start` — capture the user's prompt for popup echo.
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    if (!isTopLevel(session)) return
    if (event.type !== 'user/message') return
    const source = (event.data as { source?: { kind?: string } }).source
    if (!source || source.kind !== 'user') return
    currentPrompts.set(session, blocksText((event.data as { content?: unknown[] }).content).slice(0, 200))
  })

  // pi `agent_start` — rapid-prompt spam detection + acknowledge sound.
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    if (!isTopLevel(session)) return
    if (event.type !== 'turn/start') return

    config = loadConfig()
    state = loadState()
    if (!shouldPlaySounds()) return

    const now = Date.now()
    const window = config.annoyed_window_seconds * 1000
    state.prompt_timestamps = state.prompt_timestamps.filter((t) => now - t < window)
    state.prompt_timestamps.push(now)
    saveState(state)

    if (state.prompt_timestamps.length >= config.annoyed_threshold) {
      playCategorySound('user.spam', config, state)
    } else {
      playCategorySound('task.acknowledge', config, state)
    }
  })

  // pi `tool_execution_end` with isError — error sound (opt-in) + desktop
  // notification. An individual tool failure does NOT terminate the task, so
  // by default it stays silent (`tool_error_sounds: false`); only whole-task
  // failures beep (see the turn/end handler).
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    if (!isTopLevel(session)) return
    if (event.type !== 'tool/result') return

    const data = event.data as { message?: { content?: readonly unknown[] } }
    const block = data.message?.content?.[0]
    if (!block || typeof block !== 'object') return
    const toolResult = block as { type?: string; isError?: boolean }
    if (toolResult.type !== 'tool-result' || !toolResult.isError) return

    config = loadConfig()
    state = loadState()
    if (!shouldPlaySounds()) return

    if (config.tool_error_sounds) {
      playCategorySound('task.error', config, state)
    }

    if (config.enabled && !state.paused && config.desktop_notifications) {
      const project = projectName(session)
      const errText = extractToolErrorText(toolResult)
      const detail = errText || 'failed'
      const source = (event.data as { message?: { source?: { callId?: unknown } } }).message?.source
      const toolName = toolNameFor(session, source?.callId)
      const { title, body } = buildNotifyContent('error', project, `[${toolName}]: ${detail}`)
      sendNotification(title, body, config, undefined, 'error', currentPrompts.get(session))
    }
  })

  // pi `agent_end` — completion sound + summary popup for a normal finish,
  // error sound + failure popup when the task terminates unexpectedly.
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    if (!isTopLevel(session)) return
    if (event.type !== 'turn/end') return

    config = loadConfig()
    state = loadState()
    if (!shouldPlaySounds()) return

    const now = Date.now()
    if (now - state.last_stop_time < 5000) return
    state.last_stop_time = now

    const reason = event.data.reason
    const completed = reason.kind === 'completed'

    if (completed) {
      // Silent window only suppresses task.complete, never failures.
      const silentMs = config.silent_window_seconds * 1000
      const startTime = sessionStartTimes.get(session) ?? state.session_start_time
      if (silentMs > 0 && now - startTime < silentMs) return

      saveState(state)
      playCategorySound('task.complete', config, state)

      if (config.enabled && !state.paused) {
        const project = projectName(session)
        const summary = extractLastAssistantText(session.events)
        const { title, body } = buildNotifyContent('done', project, summary || undefined)
        sendNotification(title, body, config, undefined, 'done', currentPrompts.get(session))
      }
    } else {
      // Unexpected termination (error / aborted / blocked / max-tokens /
      // interrupted): beep the error sound and surface it in a popup.
      saveState(state)
      playCategorySound('task.error', config, state)

      if (config.enabled && !state.paused && config.desktop_notifications) {
        const project = projectName(session)
        const { title, body } = buildNotifyContent('error', project, turnEndFailureLabel(reason))
        sendNotification(title, body, config, undefined, 'error', currentPrompts.get(session))
      }
    }
  })

  // pi `session_compact` — resource-limit sound + notification. Like the
  // fork, we fire on the event AFTER compaction completes, not before.
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    if (!isTopLevel(session)) return
    if (event.type !== 'compaction/end') return

    config = loadConfig()
    state = loadState()
    if (!shouldPlaySounds()) return

    playCategorySound('resource.limit', config, state)

    if (config.enabled && !state.paused && config.desktop_notifications) {
      const project = projectName(session)
      const { title, body } = buildNotifyContent('compacted', project)
      sendNotification(title, body, config, undefined, 'compacted')
    }
  })

  // Web settings: the Settings page (client half of this package) reads and
  // writes the `peon-ping` namespace; the host bridges it to the pi config /
  // state files and executes page actions (pack install, preview, refresh).
  const settings = ctx.get('settings') as SettingsLike | undefined
  if (settings !== undefined) {
    let current: () => PeonSettings = () => buildSettingsEntry(
      loadConfig(),
      loadState(),
      listPacks().map((p) => p.name),
    )
    let writingBack = false

    const onSectionChange = async (): Promise<void> => {
      const section = current()
      if (section === undefined) return

      // Actions are fire-once client commands; the host executes and clears.
      let notice = section._notice
      let packs = section.packs
      let nextAction = section._action

      if (hasAction(section)) {
        const { command, names } = parseAction(section._action)
        if (command === 'install') {
          installing = true
          try {
            const progress: string[] = []
            const report = await runInstall(names, (msg) => {
              progress.push(msg)
              ctx.logger.info(`peon-ping: ${msg}`)
            })
            packs = listPacks().map((p) => p.name)
            notice = report.cancelled
              ? `Install cancelled (${report.installed}/${report.total} packs).`
              : report.installed > 0
                ? `Installed ${report.installed}/${report.total} packs${report.failed.length > 0 ? `; failed: ${report.failed.join(', ')}` : ''}.`
                : `No packs installed (${report.total} attempted${report.failed.length > 0 ? `; failed: ${report.failed.join(', ')}` : ''}).`
          } finally {
            installing = false
          }
        } else if (command === 'preview') {
          const previewed = previewPackSound(section.default_pack)
          notice = previewed !== null ? `Previewing ${previewed}.` : 'No preview sound available (install packs first).'
        } else if (command === 'refresh') {
          packs = listPacks().map((p) => p.name)
          notice = `${packs.length} pack${packs.length === 1 ? '' : 's'} installed.`
        } else if (command.length > 0) {
          notice = `Unknown action "${command}".`
        }
        nextAction = ''
      }

      // Write the config fields through to the pi files so the event handlers
      // and any pi installation pick the changes up immediately.
      const fileConfig = configFromSettings(section, loadConfig())
      saveConfig(fileConfig)
      const fileState = loadState()
      fileState.paused = section.paused
      saveState(fileState)

      if (notice !== section._notice || nextAction !== section._action || packs !== section.packs) {
        writingBack = true
        try {
          await settings.update(PEON_SETTINGS_NS, {
            _action: nextAction,
            _notice: notice,
            packs,
          })
        } finally {
          writingBack = false
        }
      }
    }

    installSettingsSection(ctx, PEON_SETTINGS_NS, PEON_SETTINGS_SCHEMA, current(), {
      setSource: (source) => { current = source },
      onChange: () => {
        if (writingBack) return
        void onSectionChange().catch((error: unknown) => {
          ctx.logger.error(`peon-ping: settings section change failed: ${error instanceof Error ? error.message : String(error)}`)
        })
      },
    })
  }
}
