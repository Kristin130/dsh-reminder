import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Resolve the Harness seam packages from the local deepseek-harness checkout
// so tests exercise the exact API the plugin is written against.
const harness = (rel: string) => fileURLToPath(new URL(rel, 'file:///D:/1codeprojects/deepseek-harness/'))

export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/cordis': harness('vendor/cordis/src/index.ts'),
      '@deepseek-ai/dsh-session': harness('packages/core/session/src/index.ts'),
      '@deepseek-ai/dsh-session/types': harness('packages/core/session/src/types.ts'),
      '@deepseek-ai/dsh-commands': harness('packages/interaction/commands/src/index.ts'),
      '@deepseek-ai/dsh-commands/types': harness('packages/interaction/commands/src/types.ts'),
      '@deepseek-ai/dsh-agent': harness('packages/core/agent/src/index.ts'),
      '@deepseek-ai/dsh-session-title': harness('packages/session/session-title/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
  },
})
