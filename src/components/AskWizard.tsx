import { useState, type ReactNode } from 'react'

export interface AskOption {
  value: string
  label: string
  /** O palpite do robô: aparece em destaque, mas só vale quando a pessoa toca. */
  primary?: boolean
  note?: string
}

export interface AskStep {
  key: string
  /** Etiqueta curta do tipo de pergunta: "De quem é", "Categoria", "Estorno"… */
  tag: string
  title: ReactNode
  meta?: ReactNode
  hint?: ReactNode
  options: AskOption[]
  /** Campo livre para uma resposta fora dos botões. */
  other?: { placeholder: string; list?: string; button: string }
  /** Resposta já dada (undefined = pendente). */
  answer?: string
}

interface Props {
  steps: AskStep[]
  onAnswer: (key: string, value: string) => void
  /** Última tela, depois de passar por todas as perguntas. */
  summary: ReactNode
  /** Ação em lote na lista de pendentes, como aceitar todos os palpites. */
  bulk?: { label: string; run: () => void } | null
}

const SUMMARY = '__resumo__'

/** Perguntas uma por vez, com progresso, voltar, pular e "Ver todos" (só as que faltam). */
export default function AskWizard({ steps, onAnswer, summary, bulk }: Props) {
  const firstOpen = steps.find((step) => step.answer === undefined)?.key ?? SUMMARY
  const [current, setCurrent] = useState<string>(steps.length ? steps[0].key : SUMMARY)
  const [view, setView] = useState<'step' | 'pending'>('step')
  const [other, setOther] = useState<Record<string, string>>({})

  // Se a pergunta atual sumiu (a resposta de outra a tornou desnecessária), segue para a próxima pendente.
  const index = steps.findIndex((step) => step.key === current)
  const at = current === SUMMARY ? steps.length : index >= 0 ? index : steps.findIndex((step) => step.key === firstOpen)
  const step = at >= 0 && at < steps.length ? steps[at] : null
  const answered = steps.filter((item) => item.answer !== undefined).length
  const pending = steps.filter((item) => item.answer === undefined)

  const nextOpen = (from: number) => steps.slice(from + 1).find((item) => item.answer === undefined)?.key ?? SUMMARY
  function answer(target: AskStep, value: string, advance: boolean) {
    const clean = value.trim()
    if (!clean) return
    onAnswer(target.key, clean)
    setOther((all) => ({ ...all, [target.key]: '' }))
    if (advance) setCurrent(nextOpen(steps.findIndex((item) => item.key === target.key)))
  }
  const back = () => { if (at > 0) setCurrent(steps[at - 1].key) }
  const skip = () => setCurrent(at + 1 < steps.length ? steps[at + 1].key : SUMMARY)

  const options = (target: AskStep, advance: boolean) => <>
    <div className="ask-options">
      {target.options.map((option) => <button key={option.value} className={`ask-option${option.primary ? ' primary' : ''}${target.answer === option.value ? ' chosen' : ''}`} onClick={() => answer(target, option.value, advance)}>
        <span>{option.label}</span>{option.note && <small>{option.note}</small>}
      </button>)}
    </div>
    {target.other && <div className="ask-other">
      <input value={other[target.key] ?? ''} onChange={(event) => setOther((all) => ({ ...all, [target.key]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') answer(target, other[target.key] ?? '', advance) }} list={target.other.list} placeholder={target.other.placeholder} aria-label={target.other.placeholder} />
      <button className="secondary-button" disabled={!(other[target.key] ?? '').trim()} onClick={() => answer(target, other[target.key] ?? '', advance)}>{target.other.button}</button>
    </div>}
  </>

  if (!steps.length) return <>{summary}</>

  return <div className="ask-wizard">
    <div className="ask-progress" aria-label={`${answered} de ${steps.length} respondidas`}>
      <div className="ask-bar"><i style={{ width: `${Math.round((answered / steps.length) * 100)}%` }} /></div>
      <span className="muted">{answered} de {steps.length} respondidas</span>
    </div>

    {view === 'pending' ? <section className="ask-pending" aria-label="Perguntas pendentes">
      <div className="ask-pending-head">
        <h3>{pending.length ? `Faltam ${pending.length} ${pending.length === 1 ? 'pergunta' : 'perguntas'}` : 'Tudo respondido'}</h3>
        <button className="text-button" onClick={() => { setView('step'); setCurrent(firstOpen) }}>Voltar ao passo a passo</button>
      </div>
      {bulk && pending.length > 0 && <button className="secondary-button" onClick={bulk.run}>{bulk.label}</button>}
      {pending.map((item) => <div key={item.key} className="ask-card compact">
        <span className="ask-tag">{item.tag}</span>
        <p className="ask-title">{item.title}</p>
        {item.meta && <p className="muted">{item.meta}</p>}
        {item.hint && <p className="hint">{item.hint}</p>}
        {options(item, false)}
      </div>)}
      <div className="button-row"><button className={pending.length ? 'secondary-button' : 'primary-button'} onClick={() => { setView('step'); setCurrent(SUMMARY) }}>Ir para o resumo</button></div>
    </section> : step ? <section className="ask-card" aria-live="polite">
      <div className="ask-head"><span className="ask-tag">{step.tag}</span><span className="muted">{at + 1} de {steps.length}</span></div>
      <p className="ask-title big">{step.title}</p>
      {step.meta && <p className="muted">{step.meta}</p>}
      {step.hint && <p className="hint">{step.hint}</p>}
      {options(step, true)}
      <div className="ask-nav">
        <button className="text-button" disabled={at === 0} onClick={back}>Voltar</button>
        <button className="text-button" onClick={skip}>Pular</button>
        <button className="text-button" onClick={() => setView('pending')}>Ver todos{pending.length ? ` (${pending.length})` : ''}</button>
      </div>
    </section> : <>
      {pending.length > 0 && <div className="ask-left notice">
        <span>{pending.length === 1 ? 'Ficou 1 pergunta sem resposta.' : `Ficaram ${pending.length} perguntas sem resposta.`}</span>
        <button className="text-button" onClick={() => setCurrent(firstOpen)}>Responder</button>
        <button className="text-button" onClick={() => setView('pending')}>Ver todos</button>
      </div>}
      <div className="ask-nav"><button className="text-button" onClick={() => setCurrent(steps[steps.length - 1].key)}>Voltar às perguntas</button></div>
      {summary}
    </>}
  </div>
}
