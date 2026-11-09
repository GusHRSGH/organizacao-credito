/** Leitor de fotos (OCR) que roda inteiro no aparelho. Os arquivos ficam em /ocr e só são baixados na primeira vez que alguém usa. */
export type OcrProgress = (info: { status: string; progress: number }) => void

const here = (path: string) => new URL(`${import.meta.env.BASE_URL}ocr/${path}`, document.baseURI).href.replace(/\/$/, '')

let worker: Promise<import('tesseract.js').Worker> | null = null

async function getWorker(onProgress?: OcrProgress) {
  if (!worker) {
    worker = (async () => {
      const { createWorker } = await import('tesseract.js')
      return createWorker('por', 1, {
        workerPath: here('worker.min.js'), corePath: here(''), langPath: here(''),
        workerBlobURL: false, cacheMethod: 'none', gzip: true,
        logger: (message) => onProgressRef?.({ status: message.status, progress: message.progress }),
      })
    })().catch((cause) => { worker = null; throw cause })
  }
  onProgressRef = onProgress
  return worker
}
let onProgressRef: OcrProgress | undefined

/** Lê o texto de uma foto ou imagem. */
export async function readImageText(image: Blob, onProgress?: OcrProgress): Promise<string> {
  const instance = await getWorker(onProgress)
  const { data } = await instance.recognize(image)
  return data.text
}

export async function stopOcr() {
  const current = worker
  worker = null
  try { await (await current)?.terminate() } catch { /* já parou */ }
}
