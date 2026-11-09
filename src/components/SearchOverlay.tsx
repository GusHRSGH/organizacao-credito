import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { formatDate, money } from '../lib/format'
import { searchAll, type SearchHit } from '../lib/search'
import type { Invoice, Transaction } from '../types'

interface Props {
  transactions: Transaction[]
  invoices: Invoice[]
  onPick: (hit: SearchHit) => void
  onClose: () => void
}

/** Busca em todas as faturas de uma vez (atalho Ctrl+K ou "/"). */
export default function SearchOverlay({ transactions, invoices, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const { hits, total } = useMemo(() => searchAll(transactions, invoices, query), [transactions, invoices, query])

  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => { list.current?.children[active]?.scrollIntoView({ block: 'nearest' }) }, [active])

  function onKey(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((n) => Math.min(n + 1, hits.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((n) => Math.max(n - 1, 0)) }
    else if (event.key === 'Enter' && hits[active]) { event.preventDefault(); onPick(hits[active]) }
  }

  return <div className="modal-backdrop search-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal search-box" role="dialog" aria-modal="true" aria-label="Buscar em todas as faturas" onKeyDown={onKey}>
      <div className="search-input"><Icon name="search" size={18} />
        <input ref={input} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar em todas as faturas" aria-label="Buscar" autoComplete="off" enterKeyHint="search" />
        <button className="text-button" onClick={onClose}>Fechar</button></div>
      {!query.trim() && <p className="hint">Digite parte do nome, o responsável, a categoria, o mês ou o valor. Todas as palavras precisam combinar: <b>uber ana novembro</b>.</p>}
      {query.trim() && !hits.length && <p className="empty">Nada encontrado para “{query.trim()}”.</p>}
      {hits.length > 0 && <>
        <ul ref={list} className="search-results" role="listbox" aria-label="Resultados">
          {hits.map((hit, index) => <li key={hit.row.id} role="option" aria-selected={index === active}>
            <button className={index === active ? 'on' : ''} onClick={() => onPick(hit)} onMouseMove={() => setActive(index)}>
              <span className="search-top"><b>{hit.row.description}</b><span className="search-amount">{money(Number(hit.row.amount))}</span></span>
              <span className="search-meta">{formatDate(hit.row.occurred_on)} · {hit.row.person?.name ?? 'Sem responsável'} · {hit.row.category?.name ?? 'Sem categoria'} · {hit.invoice?.label ?? 'Fatura'}
                {hit.row.installment_count ? ` · ${hit.row.installment_number}/${hit.row.installment_count}` : ''}
                <span className={`ex-badge ${hit.row.status === 'paid' ? 'ok' : 'bad'}`}>{hit.row.status === 'paid' ? 'Pago' : 'Pendente'}</span></span>
            </button></li>)}
        </ul>
        <p className="hint" role="status">{total > hits.length ? `Mostrando ${hits.length} de ${total}. Refine a busca para ver o resto.` : `${total} ${total === 1 ? 'resultado' : 'resultados'}.`} Enter abre a fatura.</p>
      </>}
    </div>
  </div>
}
