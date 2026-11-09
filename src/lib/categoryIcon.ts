import type { IconName } from '../components/Icon'

const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Ícone sugerido para uma categoria, pelo nome. */
export function categoryIcon(name: string): IconName {
  const text = norm(name)
  if (/aliment|mercado|restaur|padaria|lanche|comida|ifood/.test(text)) return 'food'
  if (/transport|uber|combust|posto|carro|onibus|taxi/.test(text)) return 'car'
  if (/compra|loja|roupa|shopee|shopping/.test(text)) return 'bag'
  if (/saude|farmac|medic|dent|hospital/.test(text)) return 'heart'
  if (/lazer|cinema|stream|viagem|jogo|festa/.test(text)) return 'ticket'
  if (/assinatura|recorrent|mensal/.test(text)) return 'repeat'
  if (/pix|boleto|credito|banco|tarifa|juros/.test(text)) return 'bank'
  return 'tag'
}
