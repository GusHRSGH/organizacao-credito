import { readImageText, type OcrProgress } from './ocr'

export interface PdfProgress { page: number; pages: number; mode: 'texto' | 'foto' }

/** Junta os pedaços de texto de uma página em linhas, de cima para baixo e da esquerda para a direita. */
export function groupLines(items: Array<{ str: string; x: number; y: number }>): string[] {
  const rows: Array<{ y: number; parts: Array<{ x: number; str: string }> }> = []
  for (const item of items) {
    if (!item.str.trim()) continue
    const row = rows.find((r) => Math.abs(r.y - item.y) <= 3)
    if (row) row.parts.push({ x: item.x, str: item.str })
    else rows.push({ y: item.y, parts: [{ x: item.x, str: item.str }] })
  }
  return rows.sort((a, b) => b.y - a.y).map((row) => row.parts.sort((a, b) => a.x - b.x).map((p) => p.str.trim()).join('  '))
}

/** Lê o texto de um PDF. Páginas escaneadas (sem texto) passam pelo leitor de fotos. */
export async function readPdfText(file: File, onPage?: (info: PdfProgress) => void, onOcr?: OcrProgress): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { default: PdfWorker } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker')
  if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const out: string[] = []
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number)
    const content = await page.getTextContent()
    const lines = groupLines(content.items.flatMap((item) => ('str' in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5] }] : [])))
    if (lines.join('').replace(/\s/g, '').length >= 30) { onPage?.({ page: number, pages: doc.numPages, mode: 'texto' }); out.push(lines.join('\n')); continue }
    // página sem texto: desenha e lê como foto
    onPage?.({ page: number, pages: doc.numPages, mode: 'foto' })
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport }).promise
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não consegui desenhar a página.'))), 'image/png'))
    out.push(await readImageText(blob, onOcr))
  }
  await doc.destroy()
  return out.join('\n')
}
