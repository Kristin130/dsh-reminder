/**
 * Compaction vocabulary for the session event firehose.
 *
 * Mirrors the `compaction/*` declarations from
 * `@deepseek-ai/dsh-compaction/types` (which augments
 * `@deepseek-ai/dsh-session/types`), so this package's typecheck sees
 * `compaction/end` on `SessionEventMap` without depending on the compaction
 * package at build time. The runtime never imports values from this file; the
 * events flow through the same `session/event` firehose regardless.
 */

import type {} from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Marks the end of a compaction — logged AFTER the summary committed, so
     * notifying on it (like the pi plugin's `session_compact` after event)
     * never fires for cancelled compactions.
     */
    'compaction/end': {
      compactionId: unknown
      sourceCommandId?: unknown
      turn: number | null
      error?: string
    }
  }
}

export {}
