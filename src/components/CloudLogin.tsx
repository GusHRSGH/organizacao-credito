import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { CloudApi } from '../services/cloud'
import { messageOf } from '../lib/format'
import { Icon } from './Icon'

interface Props {
  api: CloudApi
  onCancel?: () => void
}

const COOLDOWN = 45

/** Login por e-mail: a pessoa digita o e-mail, recebe um código e digita o código. */
export default function CloudLogin({ api, onCancel }: Props) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])
  useEffect(() => { if (step === 'code') codeRef.current?.focus() }, [step])

  async function send(event?: FormEvent) {
    event?.preventDefault()
    if (busy || !email.trim()) return
    setBusy(true); setError('')
    try { await api.sendCode(email); setStep('code'); setCode(''); setWait(COOLDOWN) } catch (cause) { setError(messageOf(cause)) } finally { setBusy(false) }
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    if (busy || code.replace(/\s/g, '').length < 6) return
    setBusy(true); setError('')
    try { await api.verifyCode(email, code) } catch (cause) { setError(messageOf(cause)); setBusy(false) }
  }

  if (step === 'email') return <form className="auth-form cloud-login" onSubmit={(event) => void send(event)}>
    <label>Seu e-mail<input type="email" name="email" required autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <button className="primary-button wide" disabled={busy || !email.trim()}><Icon name="user" size={16} />{busy ? 'Enviando…' : 'Receber código'}</button>
    {error && <p className="error" role="alert">{error}</p>}
    {onCancel && <button type="button" className="text-button" onClick={onCancel}>Voltar</button>}
    <p className="hint">Sem senha. Enviamos um código para o seu e-mail; se ainda não tem conta, ela é criada na hora.</p>
  </form>

  return <form className="auth-form cloud-login" onSubmit={(event) => void verify(event)}>
    <p className="hint">Enviamos um código para <b>{email}</b>. Confira também o spam.</p>
    <label>Código do e-mail<input ref={codeRef} className="code-input" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="000000" value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))} /></label>
    <button className="primary-button wide" disabled={busy || code.length < 6}>{busy ? 'Entrando…' : 'Entrar'}</button>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="button-row">
      <button type="button" className="text-button" disabled={busy || wait > 0} onClick={() => void send()}>{wait > 0 ? `Reenviar em ${wait}s` : 'Reenviar código'}</button>
      <button type="button" className="text-button" onClick={() => { setStep('email'); setError('') }}>Trocar e-mail</button>
    </div>
  </form>
}
