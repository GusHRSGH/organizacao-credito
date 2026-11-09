export type PixKind = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'

export const PIX_KIND_LABEL: Record<PixKind, string> = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', phone: 'Celular', random: 'Chave aleatória' }

const digits = (text: string) => text.replace(/\D/g, '')

function validCpf(value: string) {
  if (value.length !== 11 || /^(\d)\1+$/.test(value)) return false
  const check = (length: number) => {
    const sum = [...value.slice(0, length)].reduce((acc, d, i) => acc + Number(d) * (length + 1 - i), 0)
    return ((sum * 10) % 11) % 10
  }
  return check(9) === Number(value[9]) && check(10) === Number(value[10])
}

function validCnpj(value: string) {
  if (value.length !== 14 || /^(\d)\1+$/.test(value)) return false
  const check = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = [...value.slice(0, length)].reduce((acc, d, i) => acc + Number(d) * weights[i], 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return check(12) === Number(value[12]) && check(13) === Number(value[13])
}

/** Descobre o tipo da chave e devolve a forma normalizada que o Pix espera. Nulo se não parece uma chave válida. */
export function detectPixKey(raw: string): { kind: PixKind; key: string } | null {
  const text = raw.trim()
  if (!text) return null
  if (text.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && text.length <= 77 ? { kind: 'email', key: text.toLowerCase() } : null
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return { kind: 'random', key: text.toLowerCase() }
  const num = digits(text)
  if (validCpf(num)) return { kind: 'cpf', key: num }
  if (validCnpj(num)) return { kind: 'cnpj', key: num }
  if (/^\+?[\d\s()-]+$/.test(text)) {
    const phone = num.startsWith('55') && num.length >= 12 ? num.slice(2) : num
    if (phone.length === 10 || phone.length === 11) return { kind: 'phone', key: `+55${phone}` }
  }
  return null
}

export function crc16(text: string) {
  let crc = 0xffff
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`
const ascii = (text: string, max: number) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .-]/g, '').trim().toUpperCase().slice(0, max) || 'NA'

/** Pix "copia e cola" (BR Code estático) com valor definido: a pessoa cola no app do banco e já vê quanto pagar. */
export function pixPayload(input: { key: string; name: string; city: string; amount?: number; reference?: string }) {
  const account = field('00', 'br.gov.bcb.pix') + field('01', input.key)
  const reference = (input.reference ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
  const body =
    field('00', '01') + field('26', account) + field('52', '0000') + field('53', '986') +
    (input.amount && input.amount > 0 ? field('54', input.amount.toFixed(2)) : '') +
    field('58', 'BR') + field('59', ascii(input.name, 25)) + field('60', ascii(input.city, 15)) + field('62', field('05', reference)) + '6304'
  return body + crc16(body)
}
