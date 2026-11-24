import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import LoanForm from './LoanForm'
import type { Loan, Wallet } from '../lib/wallet'

interface Props {
  wallets: Wallet[]
  active: string
  onPick: (id: string) => void
  onCreate: (name: string) => Promise<void>
  onCreateLoan: (name: string, loan: Loan) => Promise<boolean>
  onRename: (wallet: Wallet, name: string) => Promise<void>
  onRemove: (wallet: Wallet) => Promise<void>
}

/** Seletor de carteira (Nubank, Credifatto…) no topo: trocar, criar, renomear e apagar as vazias. */
export default function WalletSwitcher({ wallets, active, onPick, onCreate, onCreateLoan, onRename, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  const [loanOpen, setLoanOpen] = useState(false)
  const [naming, setNaming] = useState<{ id: string | null; text: string } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const current = wallets.find((wallet) => wallet.id === active) ?? wallets[0]
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) { setOpen(false); setNaming(null) } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  async function submit() {
    if (!naming || !naming.text.trim()) return
    const target = naming.id ? wallets.find((wallet) => wallet.id === naming.id) : null
    if (target) await onRename(target, naming.text)
    else await onCreate(naming.text)
    setNaming(null)
  }

  return <div className="wallet-switch" ref={box}>
    <button className="wallet-chip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} aria-label={`Carteira: ${current?.name}. Trocar de carteira`}>
      <Icon name="wallet" size={16} /><span>{current?.name}</span><span aria-hidden="true">▾</span>
    </button>
    {open && <div className="wallet-menu" role="menu" aria-label="Carteiras">
      {wallets.map((wallet) => <div key={wallet.id} className={`wallet-row ${wallet.id === active ? 'on' : ''}`}>
        {naming?.id === wallet.id
          ? <form className="wallet-form" onSubmit={(event) => { event.preventDefault(); void submit() }}><input autoFocus value={naming.text} maxLength={40} onChange={(event) => setNaming({ id: wallet.id, text: event.target.value })} aria-label="Novo nome da carteira" /><button className="primary-button">Salvar</button></form>
          : <>
            <button role="menuitemradio" aria-checked={wallet.id === active} className="wallet-pick" onClick={() => { onPick(wallet.id); setOpen(false) }}>{wallet.id === active ? '✓ ' : ''}{wallet.name}{wallet.kind === 'loan' && <small className="wallet-kind">empréstimo</small>}</button>
            <button className="icon-button" aria-label={`Renomear ${wallet.name}`} onClick={() => setNaming({ id: wallet.id, text: wallet.name })}><Icon name="edit" size={15} /></button>
            {wallet.id !== wallets[0]?.id && <button className="icon-button danger" aria-label={`Apagar ${wallet.name}`} onClick={() => void onRemove(wallet)}><Icon name="trash" size={15} /></button>}
          </>}
      </div>)}
      {naming?.id === null
        ? <form className="wallet-form" onSubmit={(event) => { event.preventDefault(); void submit() }}><input autoFocus value={naming.text} maxLength={40} placeholder="Ex.: Credifatto" onChange={(event) => setNaming({ id: null, text: event.target.value })} aria-label="Nome da nova carteira" /><button className="primary-button">Criar</button></form>
        : <button className="text-button wallet-new" onClick={() => setNaming({ id: null, text: '' })}><Icon name="plus" size={15} />Nova carteira (outro cartão)</button>}
      {naming?.id !== null && <button className="text-button wallet-new" onClick={() => { setOpen(false); setLoanOpen(true) }}><Icon name="bank" size={15} />Novo empréstimo ou financiamento</button>}
    </div>}
    {loanOpen && <LoanForm onCancel={() => setLoanOpen(false)} onSave={async (name, loan) => { if (await onCreateLoan(name, loan)) setLoanOpen(false) }} />}
  </div>
}
