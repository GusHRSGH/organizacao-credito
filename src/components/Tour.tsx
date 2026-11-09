import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type TourPage = 'dashboard' | 'invoices' | 'billing' | 'settings'
interface Props {
  onClose: () => void
  onPage: (page: TourPage) => void
  onAction: (action: 'add' | 'import') => void
}

interface Step { target?: string; page?: TourPage; icon: IconName; title: string; text: string; example?: ReactNode }

const Example = ({ children }: { children: ReactNode }) => <div className="tour-example"><span className="tour-tag">Exemplo</span>{children}</div>

const STEPS: Step[] = [
  { icon: 'sparkle', page: 'dashboard', title: 'Vamos fazer um tour de 1 minuto', text: 'Vou acender, na própria tela, cada botão importante e mostrar um exemplo de como usar. Você pode pular quando quiser.',
    example: <Example><div className="ex-row"><b>Mercado Extra</b><span>R$ 189,90</span></div><div className="ex-meta">Ana · Alimentação · 3x</div></Example> },
  { target: 'fab', page: 'dashboard', icon: 'plus', title: 'Este botão lança um gasto', text: 'Toque no + e preencha a descrição, o valor, quem gastou e a categoria. Se foi parcelado, o app espalha as parcelas pelas próximas faturas sozinho.',
    example: <Example><div className="ex-row"><b>Mercado Extra</b><span>R$ 189,90</span></div><div className="ex-meta">Ana · Alimentação · em 3x</div><div className="ex-arrow">vira 3 lançamentos de R$ 63,30: nov, dez e jan</div></Example> },
  { target: 'nav-invoices', page: 'invoices', icon: 'invoices', title: 'Faturas: um mês de cada vez', text: 'Cada mês é uma fatura. Toque num lançamento para editar, marcar como pago ou desfazer. Dá para filtrar por pessoa, categoria e situação.',
    example: <Example><div className="ex-row"><b>Fatura de novembro</b><span>R$ 1.240,00</span></div><div className="ex-meta">14 lançamentos · <span className="ex-badge bad">3 pendentes</span></div></Example> },
  { target: 'nav-billing', page: 'billing', icon: 'users', title: 'Cobrança: quem deve quanto', text: 'Aqui o app soma o que cada pessoa deve na fatura. Tudo o que está pendente fica em vermelho, e tocar num gráfico leva direto aos lançamentos.',
    example: <Example><div className="ex-row"><b>Ana</b><span>R$ 412,00 <span className="ex-badge bad">Pendente</span></span></div><div className="ex-row"><b>Bruno</b><span>R$ 96,50 <span className="ex-badge ok">Pago</span></span></div></Example> },
  { target: 'nav-settings', page: 'settings', icon: 'settings', title: 'Dados: importar, backup e conta', text: 'Traga a sua planilha, baixe o modelo, faça backup, troque o visual do app e crie sua conta para guardar tudo na nuvem.',
    example: <Example><div className="ex-chips"><span>Importar planilha .xlsx</span><span>Baixar modelo</span><span>Backup</span><span>Temas</span><span>Conta na nuvem</span></div></Example> },
  { page: 'dashboard', icon: 'check', title: 'Pronto! Por onde começar?', text: 'Escolha a primeira ação. Depois você pode rever este tour em Dados > Ajuda.' },
]

const PAD = 8
type Box = { top: number; left: number; width: number; height: number }

/** Acha o elemento visível com o marcador (a barra de baixo e o menu lateral usam o mesmo). */
function findTarget(name: string): HTMLElement | null {
  const candidates = [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)]
  return candidates.find((node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth } ) ?? null
}

/** Tour interativo: acende os botões reais do app e mostra exemplos. */
export default function Tour({ onClose, onPage, onAction }: Props) {
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  useEffect(() => { if (step.page) onPage(step.page) }, [step.page, onPage])

  const measure = useCallback(() => {
    const node = step.target ? findTarget(step.target) : null
    if (!node) { setBox(null); return }
    const rect = node.getBoundingClientRect()
    setBox({ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 })
  }, [step.target])

  useLayoutEffect(() => {
    measure()
    const again = setTimeout(measure, 120)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { clearTimeout(again); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [measure, index])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') setIndex((n) => Math.min(n + 1, STEPS.length - 1))
      if (event.key === 'ArrowLeft') setIndex((n) => Math.max(n - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const cardAtTop = !!box && box.top > window.innerHeight / 2
  return <div className="tour-layer" role="dialog" aria-modal="true" aria-label="Tour do app">
    {box ? <div className="tour-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden="true"><i /></div> : <div className="tour-dim" aria-hidden="true" />}
    <div key={index} className={`tour-card ${cardAtTop ? 'top' : 'bottom'}`}>
      <div className="tour-progress" aria-hidden="true"><i style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} /></div>
      <div className="tour-head"><span className="tour-icon"><Icon name={step.icon} size={24} /></span><small>{index + 1} de {STEPS.length}</small></div>
      <h2>{step.title}</h2>
      <p>{step.text}</p>
      {step.example}
      <div className={`tour-actions ${last ? 'stack' : ''}`}>
        {last ? <>
          <button className="primary-button" onClick={() => onAction('add')}><Icon name="plus" size={16} />Lançar meu primeiro gasto</button>
          <button className="secondary-button" onClick={() => onAction('import')}><Icon name="upload" size={16} />Importar minha planilha</button>
          <button className="text-button" onClick={onClose}>Explorar sozinho</button>
        </> : <>
          <button className="text-button" onClick={onClose}>Pular</button>
          {index > 0 && <button className="secondary-button" onClick={() => setIndex(index - 1)}>Voltar</button>}
          <button className="primary-button" onClick={() => setIndex(index + 1)}>Próximo</button>
        </>}
      </div>
    </div>
  </div>
}
