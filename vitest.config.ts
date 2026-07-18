import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // server/utils/genbaDb.ts が import する Nuxt の自動importをスタブに差し替える
      '#imports': fileURLToPath(new URL('./tests/stubs/nuxt-imports.ts', import.meta.url))
    }
  },
  test: {
    include: ['tests/**/*.test.ts']
  }
})
