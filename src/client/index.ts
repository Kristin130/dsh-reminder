/**
 * dsh-reminder settings section, browser half.
 *
 * Registers the "peon-ping sounds" page in web Settings right below
 * "Agent Presets" (`settings.section` order 21; agent-presets is 20). The
 * page reads and writes the host `peon-ping` settings namespace through the
 * settings scope, and triggers host actions (pack install, preview) through
 * the `_action` command field.
 *
 * @module dsh-reminder/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import type { SettingsScopeSpec, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { PeonSettingsSection, type PeonSectionInjected, type PeonSettingsValue } from './PeonSettingsSection.tsx'
import { en, zh, type PeonKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** peon-ping sounds settings copy. */
    'settings.peon': PeonKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.peon'

/** Host settings namespace this page binds (mirror of the host constant). */
const PEON_SETTINGS_NS = 'peon-ping'

/** Services required by the settings registration and scope transport. */
export const inject = ['slots', 'locale', 'settingsScope', 'connection', 'remote']

/** Contribute the peon-ping sounds settings page. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-reminder: copy dictionaries')

  const t = ctx.locale.bind(NS)
  const scope = ctx.settingsScope.bind<PeonSettingsValue>({ namespace: PEON_SETTINGS_NS } as SettingsScopeSpec<PeonSettingsValue>)
  const useSnapshot = bindSnapshotSelector(scope) as unknown as SnapshotSelectorHook<SettingsScopeSnapshot<PeonSettingsValue>>

  const injected = (): PeonSectionInjected => ({
    scope,
    useSnapshot,
    t,
    runAction: (action) => {
      void scope.set('_action', action)
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'peon-ping',
    order: 21,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, PeonSettingsSection))
}
