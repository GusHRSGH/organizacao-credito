import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { DEFAULT_FEE_NAME, FEE_DISPLAY_OPTIONS, displayOf, displayValue, limitLevel, parseDisplay, splitFee, type FeeSplit } from '../lib/fee'
import { parseMoney } from '../lib/quickEntry'
import { money } from '../lib/format'
import type { CardFee } from '../types'

export interface FeeBlock { invoiceId: string; label: string; split: FeeSplit | null; spend: Map<string, number> }

interface Props {
  /** Uma fatura (Esta fatura) ou várias (Tudo em aberto). Só a primeira é configurável quando `editable`. */
  blocks: FeeBlock[]
  editable: boolean
  onSave: (fee: CardFee) => Promise<void>
}

const blank = (invoiceId: string): CardFee => ({ invoice_id: invoiceId, name: DEFAULT_FEE_NAME, mode: 'fixed', value: 0, excluded: [], overrides: {}, paid: [] })

/** Taxa de uso do cartão: valor fixo ou porcentagem, dividida pelo gasto de cada um. Só entra na cobrança. */
export default function FeePanel({ blocks, editable, onSave }: Props) {
  const main = blocks[0]
  const current = main?.split?.fee ?? (main ? blank(main.invoiceId) : null)
  const [name, setName] = useState(current?.name ?? DEFAULT_FEE_NAME)
  const [mode, setMode] = useState<CardFee['mode']>(current?.mode ?? 'fixed')
  const [value, setValue] = useState(current && current.value ? String(current.value).replace('.', ',') : '')
  const [extra, setExtra] = useState(current?.extraPct ? String(current.extraPct).replace('.', ',') : '')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [limitText, setLimitText] = useState<Record<string, string>>({})
  // Limites só aparecem para editar quando a pessoa pede; o status de quem tem limite fica sempre à vista.
  const [limitsOpen, setLimitsOpen] = useState(false)
  // Depois de salva, a configuração vira uma linha com “Editar”.
  const [configOpen, setConfigOpen] = useState(!current?.value)
  const key = `${main?.invoiceId}|${current?.name}|${current?.mode}|${current?.value}|${current?.extraPct}`
  useEffect(() => { setConfigOpen(!current?.value) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setName(current?.name ?? DEFAULT_FEE_NAME); setMode(current?.mode ?? 'fixed'); setValue(current && current.value ? String(current.value).replace('.', ',') : '')
    setExtra(current?.extraPct ? String(current.extraPct).replace('.', ',') : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  // O que está sendo digitado numa linha só é descartado ao trocar de fatura, não quando a taxa recarrega.
  useEffect(() => { setEditing({}); setLimitText({}) }, [main?.invoiceId])
  if (!main || !current) return null

  const typed = parseMoney(value.trim()) ?? (value.trim() === '' ? 0 : null)
  const extraTyped = parseMoney(extra.trim()) ?? (extra.trim() === '' ? 0 : null)
  const draft: CardFee = { ...current, name: name.trim() || DEFAULT_FEE_NAME, mode, value: typed ?? 0, extraPct: extraTyped ?? 0 }
  const changed = draft.name !== current.name || draft.mode !== current.mode || draft.value !== current.value || (draft.extraPct ?? 0) !== (current.extraPct ?? 0)
  const saveLimit = (person: string) => {
    const text = limitText[person]
    if (text === undefined) return
    setLimitText((all) => Object.fromEntries(Object.entries(all).filter(([n]) => n !== person)))
    const amount = text.trim() === '' ? 0 : parseMoney(text.trim())
    if (amount === null) return
    const limits = Object.fromEntries(Object.entries(draft.limits ?? {}).filter(([n]) => n !== person))
    if (amount > 0) limits[person] = amount
    save({ ...draft, limits })
  }
  const preview = splitFee(draft, main.spend)
  const save = (fee: CardFee) => void onSave(fee)

  if (!editable) {
    const withFee = blocks.filter((block) => block.split && block.split.shares.length)
    return <section className="fee-panel" aria-label="Taxa de uso do cartão">
      <div className="fee-head"><Icon name="receipt" size={18} /><div><b>Taxas das faturas em aberto</b><small>Para configurar, abra “Esta fatura”.</small></div></div>
      {!withFee.length && <p className="muted">Nenhuma fatura em aberto tem taxa.</p>}
      {withFee.map((block) => <div key={block.invoiceId} className="fee-block">
        <b>{block.split!.fee.name} · {block.label} · {money(block.split!.total)}</b>
        <ul className="fee-people">{block.split!.shares.map((share) => <li key={share.name}>
          <span className="grow">{share.name}{displayOf(block.split!.fee, share.name) ? <small className="fee-quiet">{displayOf(block.split!.fee, share.name)!.mode === 'rounded' ? ' · arredondada' : ' · embutida'}</small> : null}</span><b>{money(share.share)}</b>
          <label className="check"><input type="checkbox" checked={share.paid} onChange={() => save({ ...block.split!.fee, paid: share.paid ? block.split!.fee.paid.filter((n) => n !== share.name) : [...block.split!.fee.paid, share.name] })} aria-label={`Taxa de ${share.name} em ${block.label} paga`} />Pago</label>
        </li>)}</ul>
      </div>)}
    </section>
  }

  return <section className="fee-panel" aria-label="Taxa de uso do cartão">
    {!configOpen && <p className="fee-summary">
      <span>{current.mode === 'fixed' ? `Valor fixo de ${money(current.value)}, dividido pelo gasto` : `${String(current.value).replace('.', ',')}% do gasto de cada um`}{current.extraPct ? ` · extra de ${String(current.extraPct).replace('.', ',')}% acima do limite` : ''}{main.split?.inherited ? ' · repetindo a fatura anterior' : ''}</span>
      <button className="text-button" onClick={() => setConfigOpen(true)}>Editar</button></p>}
    {configOpen && <><p className="hint">Dividida pelo gasto de cada um. Aparece só na cobrança.</p>
    <div className="fee-config">
      <label>Nome na cobrança<input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} aria-label="Nome da taxa" /></label>
      <div className="mode-switch" role="radiogroup" aria-label="Tipo de taxa">
        <button role="radio" aria-checked={mode === 'fixed'} className={mode === 'fixed' ? 'on' : ''} onClick={() => setMode('fixed')}>Valor fixo</button>
        <button role="radio" aria-checked={mode === 'percent'} className={mode === 'percent' ? 'on' : ''} onClick={() => setMode('percent')}>Porcentagem</button>
      </div>
      <label>{mode === 'fixed' ? 'Valor total (R$)' : 'Porcentagem do gasto (%)'}<input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder={mode === 'fixed' ? 'Ex.: 60' : 'Ex.: 3'} aria-label="Valor da taxa" /></label>
      <label>Extra por passar do limite (%)<input inputMode="decimal" value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="Ex.: 10 (opcional)" aria-label="Porcentagem extra por passar do limite" /></label>
      <button className="primary-button" disabled={typed === null || extraTyped === null || (extraTyped ?? 0) > 100 || (!changed && !main.split?.inherited)} onClick={() => save({ ...draft, overrides: draft.mode !== current.mode ? {} : draft.overrides })}>{draft.value === 0 && current.value ? 'Remover taxa' : 'Salvar taxa'}</button>
      {current.value > 0 && <button className="text-button" onClick={() => setConfigOpen(false)}>Fechar</button>}
    </div></>}
    {(typed === null || extraTyped === null) && <p className="neg">Não entendi esse valor.</p>}
    {mode === 'percent' && typed !== null && changed && (() => {
      // Exemplo com quem mais gastou nesta fatura, para a porcentagem fazer sentido antes de salvar.
      const top = [...main.spend].filter(([, spent]) => spent > 0).sort((a, b) => b[1] - a[1])[0]
      const pct = typed > 0 ? typed : 3
      const show = (n: number) => String(n).replace('.', ',')
      if (!top) return <p className="hint fee-example">Ex.: com 3%, quem gastou R$ 1.000,00 paga R$ 30,00 de taxa.</p>
      return <p className="hint fee-example">Ex.: com {show(pct)}%, {top[0]} (gastou {money(top[1])}) paga {money(Math.ceil(top[1] * pct) / 100)} de taxa. Com 1%, pagaria {money(Math.ceil(top[1]) / 100)}; com 5%, {money(Math.ceil(top[1] * 5) / 100)}.</p>
    })()}
    {draft.value > 0 && <>
      <ul className="fee-people">
        {[...main.spend].filter(([, spent]) => spent > 0).sort((a, b) => b[1] - a[1]).map(([person, spent]) => {
          const share = preview.shares.find((item) => item.name === person)
          const inside = !draft.excluded.includes(person)
          return <li key={person} className={inside ? '' : 'off'}>
            <div className="fee-who"><label className="check"><input type="checkbox" checked={inside} onChange={() => save({ ...draft, excluded: inside ? [...draft.excluded, person] : draft.excluded.filter((n) => n !== person), overrides: Object.fromEntries(Object.entries(draft.overrides).filter(([n]) => n !== person)) })} aria-label={`${person} participa da taxa`} />{person}</label>
              <small>gastou {money(spent)}</small></div>
            {share && <>
              <span className="fee-pct" title="Parte da taxa">{preview.total > 0 ? `${Math.round((share.share / preview.total) * 100)}%` : ''}</span>
              <input className="fee-share" inputMode="decimal" aria-label={`Parte de ${person}`} value={editing[person] ?? share.base.toFixed(2).replace('.', ',')}
                onChange={(event) => setEditing({ ...editing, [person]: event.target.value })}
                onBlur={() => { const text = editing[person]; if (text === undefined) return; const amount = parseMoney(text.trim()); setEditing((all) => Object.fromEntries(Object.entries(all).filter(([n]) => n !== person))); if (amount !== null && Math.abs(amount - share.base) > 0.004) save({ ...draft, overrides: { ...draft.overrides, [person]: amount } }) }}
                onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }} />
              {share.manual && <button className="text-button fee-reset" onClick={() => save({ ...draft, overrides: Object.fromEntries(Object.entries(draft.overrides).filter(([n]) => n !== person)) })}>Voltar ao calculado</button>}
              <label className="check"><input type="checkbox" checked={share.paid} onChange={() => save({ ...draft, paid: share.paid ? draft.paid.filter((n) => n !== person) : [...draft.paid, person] })} aria-label={`Taxa de ${person} paga`} />Pago</label>
              <label className="fee-display">Como aparece na cobrança
                <select value={displayValue(displayOf(draft, person))} aria-label={`Como a taxa aparece para ${person}`} onChange={(event) => {
                  const next = parseDisplay(event.target.value)
                  const rest = Object.fromEntries(Object.entries(draft.display ?? {}).filter(([n]) => n !== person))
                  save({ ...draft, display: next ? { ...rest, [person]: next } : rest })
                }}>{FEE_DISPLAY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              {(limitsOpen || share.limit) && <div className="fee-limit">
                {limitsOpen && <label>Limite<input inputMode="decimal" placeholder="sem limite" aria-label={`Limite de ${person}`} value={limitText[person] ?? (share.limit ? share.limit.toFixed(2).replace('.', ',') : '')}
                  onChange={(event) => setLimitText({ ...limitText, [person]: event.target.value })} onBlur={() => saveLimit(person)}
                  onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }} /></label>}
                {share.limit && (() => {
                  const level = limitLevel(spent, share.limit)
                  const left = Math.max(0, Math.round((share.limit - spent) * 100) / 100)
                  if (level === 'over') return <small className="fee-status over">Passou do limite{share.extra > 0 ? `: + ${money(share.extra)} de taxa extra` : ''}</small>
                  return <small className={`fee-status ${level}`}>{level === 'near' ? 'Perto do limite: ' : ''}pode gastar mais {money(left)}</small>
                })()}
              </div>}
            </>}
          </li>
        })}
      </ul>
      <button className="text-button" onClick={() => setLimitsOpen(!limitsOpen)}>{limitsOpen ? 'Pronto' : 'Definir limites'}</button>
      <p className="hint">Total da taxa: <b>{money(preview.total)}</b>{draft.mode === 'fixed' && Math.abs(preview.total - draft.value) > 0.004 ? ` (cada parte arredonda para cima no centavo)` : ''}. Mude a parte de alguém e o resto se ajusta.{preview.shares.some((item) => item.extra > 0) ? ` Inclui ${money(preview.shares.reduce((sum, item) => sum + Math.round(item.extra * 100), 0) / 100)} de extra por limite.` : ''}</p>
    </>}
  </section>
}
