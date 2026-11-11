// Lançar falando: reconhecimento de voz nativo no Android e o do navegador onde existir.
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition as NativeSpeech } from '@capacitor-community/speech-recognition'

/** Ajusta o jeito de falar valores: "12 vírgula 50" e "12 reais e 50 centavos" viram "12,50". */
export function normalizeSpoken(text: string) {
  return text
    .replace(/(\d+)\s+(?:reais?\s+e\s+)?(\d{1,2})\s+centavos?/gi, '$1,$2')
    .replace(/(\d+)\s+v[ií]rgula\s+(\d{1,2})\b/gi, '$1,$2')
    .replace(/(\d+)\s+reais?\s+e\s+(\d{1,2})\b(?!\s*(?:x|vezes|\/))/gi, '$1,$2')
    .replace(/\s+/g, ' ')
    .trim()
}

interface WebRecognition { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: ((event: { error?: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void }
type WebCtor = new () => WebRecognition
const webCtor = (): WebCtor | null => {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: WebCtor; webkitSpeechRecognition?: WebCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const isElectron = () => typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)

/** O Electron não traz o serviço de voz do Google, então só o celular e navegadores com suporte mostram o microfone. */
export const voiceAvailable = () => Capacitor.isNativePlatform() || (!isElectron() && !!webCtor())

export interface Listening { stop: () => void }
export interface ListenHandlers { onText: (text: string) => void; onEnd: () => void; onError: (message: string) => void }

export async function startListening(handlers: ListenHandlers): Promise<Listening> {
  if (Capacitor.isNativePlatform()) {
    const permission = await NativeSpeech.requestPermissions().catch(() => null)
    if (!permission || permission.speechRecognition !== 'granted') throw new Error('Permita o microfone para o Chacun nas configurações do aparelho.')
    if (!(await NativeSpeech.available().catch(() => ({ available: false }))).available) throw new Error('Este aparelho não tem reconhecimento de voz disponível.')
    let ended = false
    const finish = () => { if (ended) return; ended = true; void NativeSpeech.removeAllListeners().catch(() => undefined); handlers.onEnd() }
    await NativeSpeech.removeAllListeners().catch(() => undefined)
    await NativeSpeech.addListener('partialResults', (data) => { if (data.matches?.[0]) handlers.onText(normalizeSpoken(data.matches[0])) })
    await NativeSpeech.addListener('listeningState', (data) => { if (data.status === 'stopped') finish() })
    try {
      const result = await NativeSpeech.start({ language: 'pt-BR', maxResults: 1, partialResults: true, popup: false, prompt: 'Fale o gasto' })
      if (result?.matches?.[0]) handlers.onText(normalizeSpoken(result.matches[0]))
    } catch (cause) { finish(); throw new Error(cause instanceof Error && cause.message ? cause.message : 'Não consegui ouvir agora.') }
    return { stop: () => { void NativeSpeech.stop().catch(() => undefined); finish() } }
  }
  const Ctor = webCtor()
  if (!Ctor) throw new Error('Este navegador não tem reconhecimento de voz.')
  const recognition = new Ctor()
  recognition.lang = 'pt-BR'; recognition.interimResults = true; recognition.continuous = false
  recognition.onresult = (event) => { const list = Array.from(event.results as ArrayLike<ArrayLike<{ transcript: string }>>); handlers.onText(normalizeSpoken(list.map((item) => item[0]?.transcript ?? '').join(' '))) }
  recognition.onerror = (event) => handlers.onError(event.error === 'not-allowed' ? 'Permita o microfone para falar o gasto.' : event.error === 'no-speech' ? 'Não ouvi nada. Tente de novo.' : 'Não consegui ouvir agora.')
  recognition.onend = () => handlers.onEnd()
  recognition.start()
  return { stop: () => recognition.stop() }
}
