import { useMemo, useState } from 'react'
import { planDescriptions, planMerge, type CleanupPlan, type DescriptionFix, type NameFix } from '../lib/cleanup'
import type { Transaction } from '../types'

interface Props { transactions: Transaction[]; busy: boolean; onApply: (plan: CleanupPlan) => void; onCancel: () => void }

const short = (list: string[]) => `${list.slice(0, 3).join(', ')}${list.length > 3 ? ` e mais ${list.length - 3}` : ''}`

function countNames(transactions: Transaction[], key: 'person' | 'category') {
  const map = new Map<string, number>()
  for (const row of transactions) { const name = row[key]?.name; if (name) map.set(name, (map.get(name) ?? 0) + 1) }
  return [...map].map(([name, count]) => ({ name, count }))
}

/** Mostra o que o robô acha que está bagunçado e só mexe no que a pessoa marcar. */
export default function CleanupAssistant({ transactions, busy, onApply, onCancel }: Props) {
  const descriptions = useMemo(() => planDescriptions(transactions), [transactions])
  const people = useMemo(() => planMerge(countNames(transactions, 'person'), 'person'), [transactions])
  const categories = useMemo(() => planMerge(countNames(transactions, 'category'), 'category'), [transactions])
  const [off, setOff] = useState<Set<string>>(() => new Set([...people.filter((fix) => fix.maybe).map((fix) => `p:${fix.from.join('|')}`)]))
  const [edited, setEdited] = useState<Record<string, string>>({})
  const toggle = (id: string) => setOff((all) => { const next = new Set(all); if (next.has(id)) next.delete(id); else next.add(id); return next })

  const dKey = (fix: DescriptionFix) => `d:${fix.from.join('|')}`
  const pKey = (fix: NameFix) => `p:${fix.from.join('|')}`
  const cKey = (fix: NameFix) => `c:${fix.from.join('|')}`
  const chosen = descriptions.filter((fix) => !off.has(dKey(fix))).length + people.filter((fix) => !off.has(pKey(fix))).length + categories.filter((fix) => !off.has(cKey(fix))).length

  function apply() {
    onApply({
      descriptions: descriptions.filter((fix) => !off.has(dKey(fix))).map((fix) => ({ from: fix.from, to: (edited[dKey(fix)] ?? fix.to).trim() || fix.to })),
      people: people.filter((fix) => !off.has(pKey(fix))).map((fix) => ({ from: fix.from, to: fix.to })),
      categories: categories.filter((fix) => !off.has(cKey(fix))).map((fix) => ({ from: fix.from, to: fix.to })),
    })
  }

  const nothing = !descriptions.length && !people.length && !categories.length
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <div className="modal assistant" role="dialog" aria-modal="true" aria-label="Robô de limpeza">
      <h2>{nothing ? 'Tudo certo por aqui' : 'Achei isso para arrumar'}</h2>
      <p className="hint">{nothing ? 'Não encontrei descrições sujas nem nomes repetidos.' : 'Desmarque o que não quiser mudar e edite o nome novo se preferir. O app guarda uma cópia antes, então dá para voltar em Cópias automáticas.'}</p>
      {descriptions.length > 0 && <section className="assistant-sheet"><b>Descrições ({descriptions.length})</b>
        {descriptions.map((fix) => <div key={dKey(fix)} className={`clean-row ${off.has(dKey(fix)) ? 'off' : ''}`}>
          <input type="checkbox" checked={!off.has(dKey(fix))} onChange={() => toggle(dKey(fix))} aria-label={`Trocar ${short(fix.from)}`} />
          <span className="clean-from">{short(fix.from)}</span><span aria-hidden="true">→</span>
          <input className="clean-to" value={edited[dKey(fix)] ?? fix.to} maxLength={160} onChange={(event) => setEdited({ ...edited, [dKey(fix)]: event.target.value })} aria-label={`Novo nome para ${short(fix.from)}`} />
          <small className="muted">{fix.count} {fix.count === 1 ? 'lançamento' : 'lançamentos'}</small></div>)}
      </section>}
      {[['Responsáveis repetidos', people, pKey] as const, ['Categorias repetidas', categories, cKey] as const].map(([title, list, key]) => list.length > 0 && <section key={title} className="assistant-sheet"><b>{title} ({list.length})</b>
        {list.map((fix) => <label key={key(fix)} className={`clean-row ${off.has(key(fix)) ? 'off' : ''}`}>
          <input type="checkbox" checked={!off.has(key(fix))} onChange={() => toggle(key(fix))} />
          <span className="clean-from">{short(fix.from)}</span><span aria-hidden="true">→</span><b>{fix.to}</b>
          <small className="muted">{fix.count} {fix.count === 1 ? 'lançamento' : 'lançamentos'}{fix.maybe ? ' · talvez seja a mesma pessoa, confira' : ''}</small></label>)}
      </section>)}
      <div className="button-row">{!nothing && <button className="primary-button" disabled={busy || !chosen} onClick={apply}>Arrumar {chosen} {chosen === 1 ? 'item' : 'itens'}</button>}<button className="text-button" onClick={onCancel}>{nothing ? 'Fechar' : 'Cancelar'}</button></div>
    </div>
  </div>
}
