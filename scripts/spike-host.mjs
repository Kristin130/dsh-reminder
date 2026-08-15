/**
 * Host smoke: mount the real settings service (dsh-settings-file) + the
 * dsh-reminder host plugin on a real cordis Context, then mutate the
 * `peon-ping` namespace and verify the bridge writes the pi config file and
 * executes a page action.
 *
 * NOTE: run with a TEMP HOME so the plugin's homedir()-based paths stay out
 * of the real ~/.config/peon-ping (os.homedir() caches at process start):
 *   $env:HOME = <temp>; $env:USERPROFILE = <temp>; node spike-host.mjs
 */
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// Resolve real packages from the web profile's node_modules (hoisted).
const profile = 'C:/Users/Isaac/.dsh/profiles/web'
const resolve = (spec) => require.resolve(spec, { paths: [profile] })
const load = async (spec) => import(pathToFileURL(resolve(spec)).href)

const { Context } = await load('@deepseek-ai/cordis')
const SettingsFilePlugin = (await load('@deepseek-ai/dsh-settings-file')).default
const plugin = await import(pathToFileURL(resolve('dsh-reminder')).href)

const doc = join(mkdtempSync(join(tmpdir(), 'dsh-reminder-smoke-')), 'settings.yaml')
const statePath = join(mkdtempSync(join(tmpdir(), 'dsh-reminder-state-')), 'state.json')

try {
  const ctx = new Context()
  new SettingsFilePlugin(ctx, { path: doc, watch: false })
  ctx.plugin(plugin) // dsh-reminder host
  await new Promise((r) => setTimeout(r, 50))

  const settings = ctx.settings
  const described = await settings.describe({})
  const list = Array.isArray(described) ? described : (described.result?.value?.namespaces ?? [])
  console.log('describe isArray:', Array.isArray(described), '; first keys:', JSON.stringify(Object.keys(list[0] ?? {})))
  const ns = list.find((n) => n.ns === 'peon-ping')
  if (ns === undefined) throw new Error('peon-ping namespace not registered')
  console.log('namespace registered; volume =', ns.value.volume, '; packs =', JSON.stringify(ns.value.packs))

  // Mutate like the web page would (settingsScope.set -> settings.mutate).
  await settings.mutate('peon-ping', [{ op: 'set', path: ['volume'], value: 0.33 }])
  await settings.mutate('peon-ping', [{ op: 'set', path: ['desktop_notifications'], value: false }])

  // Allow the async onChange to settle.
  await new Promise((r) => setTimeout(r, 300))

  const cfgPath = join(process.env.HOME ?? process.env.USERPROFILE, '.config', 'peon-ping', 'config.json')
  if (!existsSync(cfgPath)) throw new Error('config.json was not written by the bridge')
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
  console.log('config.json volume =', cfg.volume, '; notifications =', cfg.desktop_notifications)
  if (cfg.volume !== 0.33 || cfg.desktop_notifications !== false) {
    throw new Error('bridge did not write the mutated fields to the pi config file')
  }

  // Action round-trip: trigger a `refresh` action; the host clears _action and
  // publishes _notice + packs.
  await settings.mutate('peon-ping', [{ op: 'set', path: ['_action'], value: 'refresh' }])
  await new Promise((r) => setTimeout(r, 500))
  const described2 = await settings.describe({})
  const list2 = Array.isArray(described2) ? described2 : (described2.result?.value?.namespaces ?? [])
  const after = list2.find((n) => n.ns === 'peon-ping')
  console.log('after refresh: _action =', JSON.stringify(after.value._action), '; _notice =', JSON.stringify(after.value._notice))
  if (after.value._action !== '') throw new Error('_action was not cleared by the host')
  if (after.value._notice.length === 0) throw new Error('_notice was not published')

  console.log('HOST SMOKE OK')
} catch (error) {
  console.error('HOST SMOKE FAILED:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
