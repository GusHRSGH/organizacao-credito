import { useMemo, useState } from 'react'
import { Icon } from './Icon'
import { readCard } from '../lib/card'
import { buildReminders } from '../lib/reminders'
import { useSettings } from '../lib/settings'
import type { Invoice, Transaction } from '../types'

const KEY = 'oc:avisos-dispensados'
const readDismissed = (): string[] => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[] } catch { return [] } }

/** Faixa com os avisos que você ligou em Configurações > Avisos. Dispensar vale até fechar o app. */
export default function Reminders({ invoices, transactions, onGo }: { invoices: Invoice[]; transactions: Transaction[]; onGo: (page: 'invoices' | 'billing' | 'goals') => void }) {
  const [settings] = useSettings()
  const [dismissed, setDismissed] = useState(readDismissed)
  const today = new Date().toISOString().slice(0, 10)
  const list = useMemo(() => buildReminders(settings, readCard(), invoices, transactions, today), [settings, invoices, transactions, today])
  const shown = list.filter((item) => !dismissed.includes(item.id)).slice(0, 3)
  if (!shown.length) return null
  const hide = (id: string) => { const next = [...dismissed, id]; setDismissed(next); try { sessionStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignora */ } }
  return <div className="reminders" role="status" aria-label="Avisos">{shown.map((item) => <div key={item.id} className="reminder"><Icon name="clock" size={16} /><span>{item.text}</span><button className="text-button" onClick={() => onGo(item.go)}>Ver</button><button className="text-button" onClick={() => hide(item.id)} aria-label="Dispensar aviso">Dispensar</button></div>)}</div>
}
