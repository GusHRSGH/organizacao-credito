import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Arquivos do leitor de fotos (OCR). Ficam em public/ocr e só são baixados quando alguém usa o leitor.
// São copiados dos pacotes para não pesar no repositório.
const OCR_FILES: Array<[string, string]> = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz', 'por.traineddata.gz'],
]
mkdirSync('public/ocr', { recursive: true })
for (const [from, to] of OCR_FILES) if (existsSync(from) && !existsSync(`public/ocr/${to}`)) cpSync(from, `public/ocr/${to}`)

export default defineConfig({
  base: './',
  plugins: [react()],
  // Os testes de tela (e2e) rodam com o Playwright, não com o Vitest.
  test: { exclude: ['e2e/**', 'node_modules/**', 'dist/**'] },
})
