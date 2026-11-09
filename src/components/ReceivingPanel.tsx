import { useState } from 'react'
import { Icon } from './Icon'
import { detectPixKey, PIX_KIND_LABEL } from '../lib/pix'
import { hasReceiving, writeReceiving, type Receiving } from '../lib/receiving'

interface Props { value: Receiving; onChange: (value: Receiving) => void; preview: string }

/** Onde a pessoa recebe: chave Pix e recado. Entra no fim de toda cobrança copiada. */
export default function ReceivingPanel({ value, onChange, preview }: Props) {
  const [editing, setEditing] = useState(!hasReceiving(value))
  const [draft, setDraft] = useState(value)
  const pix = detectPixKey(draft.key)
  const invalidKey = draft.key.trim() !== '' && !pix

  function save() {
    onChange(draft); writeReceiving(draft); setEditing(false)
  }

  if (!editing) {
    const known = detectPixKey(value.key)
    return <section className="receiving" data-tour="bill-receive" aria-label="Como você recebe">
      <div className="receiving-line"><Icon name="wallet" size={18} />
        <div><b>Como você recebe</b><small>{value.key ? `Pix ${known ? PIX_KIND_LABEL[known.kind].toLowerCase() : ''}: ${value.key}` : 'Só o recado'}{value.holder ? ` · ${value.holder}` : ''}</small></div>
        <label className="check"><input type="checkbox" checked={value.include} onChange={(event) => { const next = { ...value, include: event.target.checked }; onChange(next); writeReceiving(next) }} />Incluir nas cobranças</label>
        <button className="text-button" onClick={() => { setDraft(value); setEditing(true) }}>Editar</button></div>
      {value.include && preview && <details><summary>Ver como a cobrança termina</summary><pre className="receiving-preview">{preview}</pre></details>}
    </section>
  }

  return <section className="receiving editing" data-tour="bill-receive" aria-label="Como você recebe">
    <div className="receiving-line"><Icon name="wallet" size={18} /><div><b>Como você recebe</b><small>Aparece no fim de cada cobrança que você copiar. Fica só neste aparelho.</small></div></div>
    <div className="receiving-grid">
      <label>Chave Pix<input value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} placeholder="CPF, e-mail, celular ou chave aleatória" autoComplete="off" /></label>
      <label>Nome de quem recebe<input value={draft.holder} onChange={(event) => setDraft({ ...draft, holder: event.target.value })} placeholder="Como aparece no banco" maxLength={25} /></label>
      <label>Cidade (opcional)<input value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} placeholder="Maringá" maxLength={15} /></label>
    </div>
    {pix && <p className="hint ok">Reconheci como {PIX_KIND_LABEL[pix.kind]}.{draft.holder.trim() ? ' Com o nome preenchido, cada cobrança leva também o Pix copia e cola já com o valor certo.' : ' Preencha o nome para a cobrança levar também o Pix copia e cola já com o valor.'}</p>}
    {invalidKey && <p className="hint neg">Não reconheci essa chave. Confira o CPF, o e-mail ou o celular com DDD.</p>}
    <label>Recado (opcional)<textarea rows={2} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Ex.: Banco Nubank. Manda o comprovante aqui, por favor." maxLength={300} /></label>
    <div className="button-row"><button className="primary-button" disabled={invalidKey || !hasReceiving(draft)} onClick={save}>Salvar</button>
      {hasReceiving(value) && <button className="text-button" onClick={() => setEditing(false)}>Cancelar</button>}</div>
  </section>
}
