import { useState } from 'react'
import { Panel } from './ui'
import { messageOf } from '../lib/format'
import { parseItemIds, PluggyClient, readPluggy, validItemId, writePluggy } from '../lib/pluggy'

interface Props { notify: (kind: 'notice' | 'error', text: string) => void }

/** Modo pessoal do Open Finance (Meu Pluggy): só as suas contas, com as credenciais guardadas neste aparelho. */
export default function PluggyPanel({ notify }: Props) {
  const saved = readPluggy()
  const [clientId, setClientId] = useState(saved?.clientId ?? '')
  const [clientSecret, setClientSecret] = useState(saved?.clientSecret ?? '')
  const [items, setItems] = useState((saved?.itemIds ?? []).join('\n'))
  const [connected, setConnected] = useState(!!saved)
  const [busy, setBusy] = useState(false)

  function current() {
    const itemIds = parseItemIds(items)
    const bad = itemIds.find((id) => !validItemId(id))
    if (!clientId.trim() || !clientSecret.trim()) throw new Error('Preencha o Client ID e o Client Secret.')
    if (!itemIds.length) throw new Error('Informe pelo menos um Item ID (um por conexão de banco).')
    if (bad) throw new Error(`O Item ID “${bad}” não parece válido. Ele tem o formato 3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f.`)
    if (itemIds.length > 5) throw new Error('O plano gratuito do Meu Pluggy permite até 5 conexões.')
    return { clientId: clientId.trim(), clientSecret: clientSecret.trim(), itemIds }
  }

  function save() {
    try { writePluggy(current()); setConnected(true); notify('notice', 'Credenciais salvas neste aparelho. Agora é só testar.') } catch (cause) { notify('error', messageOf(cause)) }
  }

  async function test() {
    setBusy(true)
    try {
      const config = current()
      const client = new PluggyClient(config)
      let cards = 0
      for (const id of config.itemIds) cards += (await client.creditAccounts(id)).length
      writePluggy(config); setConnected(true)
      notify(cards ? 'notice' : 'error', cards ? `Conectou! Achei ${cards} ${cards === 1 ? 'cartão de crédito' : 'cartões de crédito'}.` : 'Conectou, mas não achei cartão de crédito nessas conexões. Confira se o banco foi vinculado à sua aplicação.')
    } catch (cause) { notify('error', messageOf(cause)) } finally { setBusy(false) }
  }

  function clear() {
    if (!window.confirm('Apagar as credenciais da Pluggy deste aparelho? Seus lançamentos não mudam.')) return
    writePluggy(null); setClientId(''); setClientSecret(''); setItems(''); setConnected(false)
    notify('notice', 'Credenciais apagadas deste aparelho.')
  }

  return <Panel icon="bank" title="Open Finance (Meu Pluggy)" subtitle="Traga as compras do cartão direto do banco, sem exportar arquivo. Só para as suas próprias contas.">
    <details className="issues">
      <summary>Como configurar (uma vez)</summary>
      <ol className="hint">
        <li>Crie a conta gratuita em <b>meu.pluggy.ai</b> e conecte seu banco pelo Open Finance.</li>
        <li>Em <b>dashboard.pluggy.ai</b>, crie uma aplicação e copie o <b>Client ID</b> e o <b>Client Secret</b> (aba Aplicação).</li>
        <li>Na aplicação, crie uma conexão escolhendo o conector <b>MeuPluggy</b> e entre com a sua conta. Faça isso para cada banco.</li>
        <li>Copie o <b>Item ID</b> de cada conexão (aba Items do painel) e cole abaixo, um por linha.</li>
      </ol>
    </details>
    <label className="field-stack">Client ID<input value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" spellCheck={false} aria-label="Client ID da Pluggy" /></label>
    <label className="field-stack">Client Secret<input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} autoComplete="off" spellCheck={false} aria-label="Client Secret da Pluggy" /></label>
    <label className="field-stack">Item ID de cada conexão (um por linha, até 5)<textarea rows={3} value={items} onChange={(event) => setItems(event.target.value)} spellCheck={false} aria-label="Item IDs da Pluggy" /></label>
    <div className="button-row">
      <button className="primary-button" disabled={busy} onClick={() => void test()}>{busy ? 'Testando…' : 'Salvar e testar'}</button>
      <button className="secondary-button" disabled={busy} onClick={save}>Só salvar</button>
      {connected && <button className="text-button" disabled={busy} onClick={clear}>Apagar deste aparelho</button>}
    </div>
    <p className="hint">{connected ? 'Pronto: em Lançamentos, Importar fatura do banco, aparece o botão “Buscar no banco (Meu Pluggy)”. ' : ''}O Client Secret fica só neste aparelho e não entra em backups. Use o bloqueio do app (Privacidade) se o celular for emprestado. O banco atualiza os dados na Pluggy a cada 24 horas, então compras de hoje podem demorar a aparecer.</p>
  </Panel>
}
