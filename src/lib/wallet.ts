import { useSyncExternalStore } from 'react'

/** Carteira: um cartão (Nubank, Credifatto…) ou, mais adiante, um empréstimo. Cada uma tem as suas faturas. */
export interface Wallet { id: string; name: string; kind: 'card' | 'loan' }

/** A carteira que já existia antes das carteiras: tudo o que não tem carteira marcada é dela. */
export const MAIN_WALLET = 'principal'
export const MAIN_WALLET_NAME = 'Cartão principal'

const KEY = 'oc:carteira'
const listeners = new Set<() => void>()
let active = (() => { try { return localStorage.getItem(KEY) || MAIN_WALLET } catch { return MAIN_WALLET } })()
/** Carteiras conhecidas (nome e id), para os avisos e os textos que precisam saber de todas. */
let known: Wallet[] = [{ id: MAIN_WALLET, name: MAIN_WALLET_NAME, kind: 'card' }]

export const walletOf = (invoice: { wallet_id?: string | null }) => invoice.wallet_id || MAIN_WALLET
export const getActiveWallet = () => active
export const getKnownWallets = () => known

export function setActiveWallet(id: string) {
  if (id === active) return
  active = id
  try { localStorage.setItem(KEY, id) } catch { /* vale até recarregar */ }
  listeners.forEach((listener) => listener())
}

export function setKnownWallets(list: Wallet[]) {
  known = list.length ? list : known
  if (!known.some((wallet) => wallet.id === active)) setActiveWallet(MAIN_WALLET)
}

export function useActiveWallet(): string {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, getActiveWallet, () => MAIN_WALLET)
}

/** Lista das carteiras gravadas, sempre com a principal (que existe mesmo sem ter sido salva). */
export function withMain(list: Wallet[] | undefined): Wallet[] {
  const all = list ?? []
  return all.some((wallet) => wallet.id === MAIN_WALLET) ? all : [{ id: MAIN_WALLET, name: MAIN_WALLET_NAME, kind: 'card' }, ...all]
}
