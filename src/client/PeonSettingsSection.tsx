/**
 * peon-ping settings section: reads and writes the host `peon-ping` settings
 * namespace through the settings scope, and triggers host actions (install /
 * preview / refresh) through the `_action` command field.
 *
 * The component deliberately imports no Host value modules — the namespace id
 * and value shape are restated here (type-only), so the browser bundle stays
 * free of node-only imports.
 * @module dsh-reminder/client/PeonSettingsSection
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { PeonKey } from './locales.ts'
import css from './PeonSettingsSection.module.css'

/** Client-side mirror of the host settings section (type-only). */
export interface PeonSettingsValue {
  default_pack: string
  volume: number
  enabled: boolean
  desktop_notifications: boolean
  tool_error_sounds: boolean
  silent_window_seconds: number
  relay_mode: 'auto' | 'local' | 'relay'
  paused: boolean
  categories: Record<string, boolean>
  packs: string[]
  _action: string
  _notice: string
}

/** Actions the registration injects into this component. */
export interface PeonSectionInjected {
  scope: SettingsScope<PeonSettingsValue>
  useSnapshot: SnapshotSelectorHook<SettingsScopeSnapshot<PeonSettingsValue>>
  t: (key: PeonKey) => string
  runAction: (action: string) => void
}

/** Full component props: owner props + injected face. */
export interface PeonSectionProps extends PeonSectionInjected {
  /** Close the settings panel (shell affordance). */
  close: () => void
}

/** Category keys in the order the pi settings panel lists them. */
const CATEGORIES: { key: string; label: PeonKey }[] = [
  { key: 'session.start', label: 'cat.session.start' },
  { key: 'task.acknowledge', label: 'cat.task.acknowledge' },
  { key: 'task.complete', label: 'cat.task.complete' },
  { key: 'task.error', label: 'cat.task.error' },
  { key: 'input.required', label: 'cat.input.required' },
  { key: 'resource.limit', label: 'cat.resource.limit' },
  { key: 'user.spam', label: 'cat.user.spam' },
]

function Row({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className={css.row}>
      <span className={css.label}>{label}</span>
      <span className={css.control}>{children}</span>
    </div>
  )
}

function Toggle({ on, onChange, onText, offText }: {
  on: boolean
  onChange: (next: boolean) => void
  onText: string
  offText: string
}): ReactNode {
  return (
    <button
      type="button"
      className={`${css.toggle} ${on ? css.toggleOn : ''}`}
      onClick={() => onChange(!on)}
    >
      {on ? onText : offText}
    </button>
  )
}

export function PeonSettingsSection(props: PeonSectionProps): ReactNode {
  const { useSnapshot, t, runAction } = props
  const snap = useSnapshot((snapshot) => snapshot)
  const value = snap.value
  const [pending, setPending] = useState(false)
  const lastNotice = useRef<string | null>(null)

  // Clear the busy flag once the host has consumed the action and published a
  // fresh notice (the settings scope refreshes on the host update).
  useEffect(() => {
    if (value === undefined) return
    if (lastNotice.current !== value._notice) {
      lastNotice.current = value._notice
      setPending(false)
    }
  }, [value])

  if (snap.status === 'loading' || value === undefined) {
    return <div className={css.wrap}>{t('notice')}…</div>
  }
  if (snap.status === 'unavailable') {
    return <div className={css.wrap}>{t('notice')}: unavailable</div>
  }

  const set = (field: keyof PeonSettingsValue, next: unknown): void => {
    void props.scope.set(field as string, next)
  }

  const trigger = (action: string): void => {
    setPending(true)
    runAction(action)
  }

  const activePack = value.packs.includes(value.default_pack) ? value.default_pack : value.packs[0]

  return (
    <div className={css.wrap}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.description}>{t('description')}</p>

      {value._notice !== '' ? (
        <div className={css.notice}>
          {t('notice')}: {value._notice}
        </div>
      ) : null}

      <Row label={`${t('sounds')} (${t(value.paused ? 'paused' : 'active')})`}>
        <Toggle
          on={value.enabled}
          onChange={(next) => set('enabled', next)}
          onText={t('enabled')}
          offText={t('disabled')}
        />
        <Toggle
          on={!value.paused}
          onChange={(next) => set('paused', !next)}
          onText={t('active')}
          offText={t('paused')}
        />
      </Row>

      <Row label={t('soundPack')}>
        <select
          className={css.select}
          value={activePack ?? ''}
          onChange={(event) => set('default_pack', event.target.value)}
        >
          {value.packs.length === 0 ? (
            <option value="">{t('noPacks')}</option>
          ) : (
            value.packs.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))
          )}
        </select>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => trigger('install')}
        >
          {pending ? t('installing') : t('install')}
        </Button>
        <Button
          variant="outline"
          disabled={pending || value.packs.length === 0}
          onClick={() => trigger('preview')}
        >
          {t('preview')}
        </Button>
      </Row>

      <Row label={`${t('volume')}: ${Math.round(value.volume * 100)}%`}>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={Math.round(value.volume * 100)}
          onChange={(event) => set('volume', Number(event.target.value) / 100)}
          className={css.range}
        />
      </Row>

      <Row label={t('notifications')}>
        <Toggle
          on={value.desktop_notifications}
          onChange={(next) => set('desktop_notifications', next)}
          onText={t('enabled')}
          offText={t('disabled')}
        />
      </Row>

      <Row label={t('toolErrorBeep')}>
        <Toggle
          on={value.tool_error_sounds}
          onChange={(next) => set('tool_error_sounds', next)}
          onText={t('enabled')}
          offText={t('disabled')}
        />
      </Row>

      <Row label={t('silentWindow')}>
        <input
          type="number"
          min={0}
          max={300}
          value={value.silent_window_seconds}
          onChange={(event) => set('silent_window_seconds', Number(event.target.value) || 0)}
          className={css.number}
        />
      </Row>

      <Row label={t('relayMode')}>
        <select
          className={css.select}
          value={value.relay_mode}
          onChange={(event) => set('relay_mode', event.target.value)}
        >
          <option value="auto">auto</option>
          <option value="local">local</option>
          <option value="relay">relay</option>
        </select>
      </Row>

      <div className={css.categories}>
        <div className={css.catLabel}>{t('category')}</div>
        {CATEGORIES.map(({ key, label }) => (
          <div key={key} className={css.catRow}>
            <span>{t(label)}</span>
            <Toggle
              on={value.categories[key] !== false}
              onChange={(next) => {
                const nextCategories = { ...value.categories, [key]: next }
                set('categories', nextCategories)
              }}
              onText={t('enabled')}
              offText={t('disabled')}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
