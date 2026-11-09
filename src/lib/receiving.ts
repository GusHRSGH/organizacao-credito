import { detectPixKey, pixPayload, PIX_KIND_LABEL } from './pix'

export interface Receiving { key: string; holder: string; city: string; note: string; include: boolean }

const STORE = 'oc:recebimento'
export const EMPTY_RECEIVING: Receiving = { key: '', holder: '', city: '', note: '', include: true }

/** Fica só neste aparelho (não entra no backup da nuvem). */
export function readReceiving(): Receiving {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<Receiving> | null
    return raw ? { ...EMPTY_RECEIVING, ...raw } : EMPTY_RECEIVING
  } catch { return EMPTY_RECEIVING }
}

export function writeReceiving(value: Receiving) {
  try { localStorage.setItem(STORE, JSON.stringify(value)) } catch { /* sem armazenamento: vale até recarregar */ }
}

export const hasReceiving = (r: Receiving) => !!(r.key.trim() || r.note.trim())

/** Bloco de texto com as informações de pagamento, para colar no fim da cobrança. */
export function receivingText(r: Receiving, amount?: number, reference?: string): string {
  if (!r.include || !hasReceiving(r)) return ''
  const lines: string[] = []
  const pix = detectPixKey(r.key)
  if (r.key.trim()) lines.push(`Pix (${pix ? PIX_KIND_LABEL[pix.kind].toLowerCase() : 'chave'}): ${r.key.trim()}${r.holder.trim() ? ` · ${r.holder.trim()}` : ''}`)
  if (pix && r.holder.trim() && amount && amount > 0) lines.push(`Pix copia e cola (já com o valor):\n${pixPayload({ key: pix.key, name: r.holder, city: r.city || 'BRASIL', amount, reference })}`)
  if (r.note.trim()) lines.push(r.note.trim())
  return lines.join('\n')
}
