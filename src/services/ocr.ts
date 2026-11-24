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
        workerBlobURL: false, cacheMethod: 'none',
        // A língua vai compactada mas sem ".gz" no nome (o empacotamento do Android mexe nesses arquivos e o leitor ficava preso em "Preparando"). O tesseract reconhece a compactação sozinho.
        gzip: false,
        logger: (message) => onProgressRef?.({ status: message.status, progress: message.progress }),
      })
    })().catch((cause) => { worker = null; throw cause })
  }
  onProgressRef = onProgress
  return worker
}
let onProgressRef: OcrProgress | undefined

/**
 * Deixa a imagem em preto no branco antes de ler: prints de app de banco usam texto cinza-claro
 * (valores e datas) e tema escuro, que o leitor perde sem esse ajuste.
 */
export async function prepareImage(image: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return image
  try {
    const bitmap = await createImageBitmap(image)
    const scale = bitmap.width < 1000 ? 2 : 1
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width * scale; canvas.height = bitmap.height * scale
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return image
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    binarize(pixels.data)
    ctx.putImageData(pixels, 0, 0)
    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? image), 'image/png'))
  } catch { return image }
}

/** Cinza vira preto, fundo vira branco; tema escuro é invertido antes. Mexe no array RGBA no lugar. */
export function binarize(data: Uint8ClampedArray) {
  let sum = 0
  const count = data.length / 4
  for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  const dark = sum / count < 128
  for (let i = 0; i < data.length; i += 4) {
    let y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    if (dark) y = 255 - y
    const v = y < 200 ? 0 : 255
    data[i] = data[i + 1] = data[i + 2] = v
    data[i + 3] = 255
  }
}

/** Lê o texto de uma foto ou imagem. */
export async function readImageText(image: Blob, onProgress?: OcrProgress): Promise<string> {
  const instance = await withTimeout(getWorker(onProgress), 90_000)
  const { data } = await instance.recognize(await prepareImage(image))
  return data.text
}

/** Se o leitor não carregar (rede, aparelho sem suporte), mostra um erro em vez de ficar preso em "Preparando". */
function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { worker = null; reject(new Error('O leitor de fotos não carregou. Feche e abra o app e tente de novo; se continuar, cole o texto da fatura no campo.')) }, ms)
    task.then((value) => { clearTimeout(timer); resolve(value) }, (cause) => { clearTimeout(timer); reject(cause) })
  })
}

export async function stopOcr() {
  const current = worker
  worker = null
  try { await (await current)?.terminate() } catch { /* já parou */ }
}
