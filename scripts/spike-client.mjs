/**
 * Offline spike: execute the built lib/client.js against a stubbed browser
 * environment, capture the __ModuleLoader__.load handoff, materialize the
 * factory with stub externals, and run the exported apply() against a stub
 * ctx to confirm the settings.section registration path does not throw.
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

let handoff = null
const window = {
  __ModuleLoader__: { load: (h) => { handoff = h } },
}
const document = {
  createElement: () => ({ dataset: {}, textContent: '', appendChild() {} }),
  querySelector: () => null,
  head: { appendChild() {} },
}
globalThis.window = window
globalThis.document = document

const code = readFileSync('lib/client.js', 'utf8')
vm.runInThisContext(code)

if (handoff === null || handoff.id !== 'dsh-reminder') throw new Error('handoff missing or wrong id')
if (typeof handoff.factory !== 'function') throw new Error('factory missing')

// Stub externals the module table would provide.
const stubs = {
  'react': { useState: () => [null, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) },
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
  '@deepseek-ai/cordis': {},
  '@deepseek-ai/dsh-client-web-react': { bindSnapshotSelector: () => () => ({}) },
  '@deepseek-ai/dsh-client-ui-primitives': { Button: () => null },
}
const exports = handoff.factory((spec) => {
  if (spec in stubs) return stubs[spec]
  throw new Error(`unexpected require: ${spec}`)
})

console.log('plugin exports:', Object.keys(exports))
if (typeof exports.apply !== 'function') throw new Error('apply missing')

// Stub ctx: the injected services appear as ctx properties (cordis inject).
const registered = []
const locale = {
  register: () => {},
  bind: () => () => 'peon-ping 声音',
}
const settingsScope = {
  bind: () => ({ getSnapshot: () => ({ status: 'ready', value: { _notice: '' } }), subscribe: () => () => {}, set: async () => {}, unset: async () => {}, load: async () => {} }),
}
const ctx = {
  effect: (fn) => { fn() },
  get: () => undefined,
  locale,
  settingsScope,
  connection: { isLoopback: true },
  remote: { $on: () => () => {} },
  slots: {
    inject: (name, fn) => { registered.push(fn()) },
    register: (options, component) => {
      if (typeof component !== 'function') throw new Error('component must be a function')
      registered.push(options)
    },
  },
}

exports.apply(ctx)
console.log('slots.inject registrations:', registered.length)
const reg = registered[0]
console.log('registration:', JSON.stringify({ name: reg.name, id: reg.id, order: reg.order }))
console.log('SPIKE OK')
