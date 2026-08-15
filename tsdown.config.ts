import { defineConfig } from 'tsdown'
import { clientBundleConfig } from './tsdown.client.ts'

// Emits lib/client.js — the browser plugin bundle the web app serves at
// /plugins/dsh-reminder/client.js (see package.json "dsh.client").
export default defineConfig(clientBundleConfig('dsh-reminder', 'src/client/index.ts'))
