import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // Os testes de tela (e2e) rodam com o Playwright, não com o Vitest.
  test: { exclude: ['e2e/**', 'node_modules/**', 'dist/**'] },
})
