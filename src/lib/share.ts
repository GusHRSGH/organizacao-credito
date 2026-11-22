import { isNative } from './native'

export type ShareResult = 'shared' | 'copied' | 'cancelled'

/**
 * Celular: abre o compartilhar do sistema (WhatsApp, Telegram…). Computador: copia o texto.
 * Fechar o compartilhar sem escolher nada conta como cancelado, não como erro.
 */
export async function shareText(text: string, title: string): Promise<ShareResult> {
  if (isNative) {
    try {
      const { Share } = await import('@capacitor/share')
      await Share.share({ text, dialogTitle: title })
      return 'shared'
    } catch (cause) {
      if (/cancel/i.test(String((cause as Error)?.message ?? cause))) return 'cancelled'
      throw cause
    }
  }
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  if (touch && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try { await navigator.share({ text }); return 'shared' } catch (cause) {
      if ((cause as Error)?.name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
