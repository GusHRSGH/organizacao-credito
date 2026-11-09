import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type TourPage = 'dashboard' | 'invoices' | 'billing' | 'settings'
interface Props {
  onClose: () => void
  onPage: (page: TourPage) => void
  onAction: (action: 'add' | 'import') => void
}

interface Step { target?: string; page?: TourPage; section: string; icon: IconName; title: string; text: string; example?: ReactNode }

const Example = ({ children }: { children: ReactNode }) => <div className="tour-example"><span className="tour-tag">Exemplo</span>{children}</div>
const Row = ({ a, b }: { a: ReactNode; b?: ReactNode }) => <div className="ex-row"><b>{a}</b>{b !== undefined && <span>{b}</span>}</div>
const Bad = ({ children }: { children: ReactNode }) => <span className="ex-badge bad">{children}</span>
const Ok = ({ children }: { children: ReactNode }) => <span className="ex-badge ok">{children}</span>
const Chips = ({ items }: { items: string[] }) => <div className="ex-chips">{items.map((item) => <span key={item}>{item}</span>)}</div>

const STEPS: Step[] = [
  { section: 'Boas-vindas', page: 'dashboard', icon: 'sparkle', title: 'Vamos conhecer o app inteiro', text: 'Em cerca de 2 minutos eu acendo, na própria tela, cada parte do app e mostro um exemplo de uso. O app tem 4 áreas: Início, Faturas, Cobrança e Dados. Você pode pular quando quiser.',
    example: <Example><Chips items={['Início', 'Faturas', 'Cobrança', 'Dados']} /></Example> },

  { section: 'Início', target: 'nav-dashboard', page: 'dashboard', icon: 'dashboard', title: 'Início: o resumo do mês', text: 'Aqui você bate o olho e sabe quanto gastou, quanto já foi pago e quanto ainda falta. Tudo é calculado sozinho a partir dos seus lançamentos.',
    example: <Example><Row a="Falta pagar" b={<Bad>R$ 1.240,00</Bad>} /><div className="ex-meta">de R$ 3.180,00 · 38 lançamentos · R$ 1.940,00 já pago</div></Example> },
  { section: 'Início', target: 'dash-select', page: 'dashboard', icon: 'repeat', title: 'Escolha o mês e compare', text: 'Selecione a fatura que quer ver e outra para comparar. O app mostra a diferença entre os dois meses em valor e em porcentagem.',
    example: <Example><Row a="Nov/2026 x Out/2026" b="+8%" /><div className="ex-meta">Você gastou R$ 236,00 a mais que no mês anterior</div></Example> },
  { section: 'Início', target: 'dash-hero', page: 'dashboard', icon: 'clock', title: 'O que falta pagar, em vermelho', text: 'O total pendente aparece grande e em vermelho. Toque nele para abrir só os lançamentos que ainda faltam pagar naquela fatura.',
    example: <Example><Row a="Falta pagar" b={<Bad>R$ 1.240,00</Bad>} /><div className="ex-arrow">toque: abre os 12 lançamentos pendentes</div></Example> },
  { section: 'Início', target: 'dash-insight', page: 'dashboard', icon: 'sparkle', title: 'O resumo do mês em uma frase', text: 'Logo abaixo dos números, o app escreve o que aconteceu: quanto você gastou, como ficou contra o outro mês e qual categoria puxou a diferença. Escolha “Comparar com” lá em cima para ele comparar. Não quer ver? Toque no × dele; volta em Dados > Aparência.',
    example: <Example><div className="ex-arrow">Em Novembro você gastou R$ 1.080,00, 8,0% a mais que em Outubro, puxado por Lazer (+R$ 100,00).</div></Example> },
  { section: 'Início', target: 'dash-radar', page: 'dashboard', icon: 'shield', title: 'O radar avisa o que importa', text: 'O app olha o mês e destaca o que merece atenção: cobrança duplicada, valor muito acima do seu normal, gasto novo e caro, categoria que disparou. Toque em “Ver” para abrir os lançamentos, ou “Ignorar” se estiver tudo bem.',
    example: <Example><div className="ex-code">Luz veio bem acima do normal</div><div className="ex-arrow">R$ 260,00 desta vez, normalmente cerca de R$ 100,00</div></Example> },
  { section: 'Início', target: 'dash-subs', page: 'dashboard', icon: 'repeat', title: 'Assinaturas descobertas sozinhas', text: 'O que se repete todo mês aparece aqui com o custo fixo somado. Se uma assinatura sobe de preço, o app avisa; se parou de ser cobrada, também.',
    example: <Example><Row a="Netflix" b={<Bad>R$ 55,90</Bad>} /><div className="ex-arrow">subiu de R$ 39,90</div></Example> },
  { section: 'Início', target: 'dash-people', page: 'dashboard', icon: 'pie', title: 'Os gráficos são clicáveis', text: 'Toque numa barra, numa fatia ou numa coluna e o app abre os lançamentos exatos por trás dela, já filtrados, para você resolver ali mesmo.',
    example: <Example><Row a="Toque na barra da Ana" b="R$ 412,00" /><div className="ex-arrow">abre só os lançamentos da Ana nessa fatura</div></Example> },
  { section: 'Início', target: 'dash-months', page: 'dashboard', icon: 'trend-up', title: 'Mês a mês', text: 'Cada coluna é uma fatura, com a parte paga e a parte pendente. Dá para ver de relance em que mês o gasto subiu.',
    example: <Example><Chips items={['Set R$ 2.900', 'Out R$ 2.944', 'Nov R$ 3.180']} /></Example> },
  { section: 'Início', target: 'search', page: 'dashboard', icon: 'search', title: 'Busca em todas as faturas', text: 'A lupa (ou as teclas Ctrl+K e /) procura em todos os meses de uma vez. Digite várias palavras: o nome, a pessoa, a categoria, o mês ou o valor. Enter abre a fatura já filtrada.',
    example: <Example><div className="ex-code">uber ana novembro</div><div className="ex-arrow">App de transporte · Ana · R$ 23,90 · Novembro 2026</div></Example> },
  { section: 'Início', target: 'fab', page: 'dashboard', icon: 'plus', title: 'Este botão lança um gasto', text: 'Em qualquer tela, toque no + para lançar uma compra. Se foi parcelada, o app espalha as parcelas pelas próximas faturas sozinho.',
    example: <Example><Row a="Mercado Extra" b="R$ 189,90" /><div className="ex-meta">Ana · Alimentação · em 3x</div><div className="ex-arrow">vira 3 lançamentos de R$ 63,30: nov, dez e jan</div></Example> },

  { section: 'Faturas', target: 'nav-invoices', page: 'invoices', icon: 'invoices', title: 'Faturas: um mês de cada vez', text: 'Aqui ficam todos os lançamentos da fatura escolhida. É a área onde você cadastra, confere, edita e dá baixa nos pagamentos.',
    example: <Example><Row a="Fatura de novembro" b="R$ 3.180,00" /><div className="ex-meta">38 lançamentos · <Bad>12 pendentes</Bad></div></Example> },
  { section: 'Faturas', target: 'quick-add', page: 'invoices', icon: 'sparkle', title: 'Lançamento rápido numa linha', text: 'Digite do jeito que você falaria e aperte Enter: “gastei 50 no mercado ontem com a Ana”, “tênis 300 em 3 vezes”, “farmácia 40 sexta”. O app entende valor, parcelas, dia, quem gastou e a categoria. Para repetir em vários meses: “em janeiro e fevereiro”, “nos próximos 3 meses”, ou o botão “Lançar em vários meses”. Com 2x ou 3x, ele mostra em quais meses cada parcela cai. Se preferir atalhos, @ é a pessoa e # a categoria.',
    example: <Example><div className="ex-code">mercado 150,90 3x @ana #casa ontem</div><div className="ex-arrow">Mercado · R$ 150,90 · 3 parcelas · Ana · Casa · ontem</div></Example> },
  { section: 'Faturas', target: 'inv-top', page: 'invoices', icon: 'upload', title: 'Colar a fatura do banco', text: 'Em “Colar fatura”, cole as linhas do banco, uma notificação, uma conversa do WhatsApp, ou anexe o PDF da fatura ou uma foto dela. O app lê tudo no seu aparelho, separa os gastos, sugere responsável e categoria, e você só confere. Para um lançamento completo, use “Formulário completo”.',
    example: <Example><div className="ex-code">fatura.pdf  ou  📷 foto</div><div className="ex-arrow">vira lançamentos prontos para conferir</div></Example> },
  { section: 'Faturas', target: 'filters', page: 'invoices', icon: 'tag', title: 'Busque e filtre', text: 'Procure por palavra ou filtre por responsável, categoria e situação. Gostou do resultado? Toque em “Salvar este filtro” e ele vira um atalho fixo, para usar de novo com um toque. Com um filtro ativo, dá para marcar todos os pendentes visíveis como pagos de uma vez.',
    example: <Example><Chips items={['Ana', 'Pendentes']} /><div className="ex-arrow">Salvar este filtro: “Pendentes · Ana”</div></Example> },
  { section: 'Faturas', target: 'tx-list', page: 'invoices', icon: 'edit', title: 'Cada lançamento tem ações', text: 'Toque no status para marcar pago ou pendente, use o lápis para editar (inclusive todas as parcelas de uma vez) e a lixeira para excluir. Se errar, o botão Desfazer aparece na hora. Marque várias caixinhas para agir em lote.',
    example: <Example><Row a="Mercado Extra 1/3" b={<>R$ 63,30 <Bad>Pendente</Bad></>} /><Chips items={['Editar', 'Marcar pago', 'Excluir', 'Desfazer']} /></Example> },

  { section: 'Cobrança', target: 'nav-billing', page: 'billing', icon: 'users', title: 'Cobrança: quem deve quanto', text: 'O app soma o que cada pessoa deve na fatura, com uma barra de progresso do que já foi pago.',
    example: <Example><Row a="Ana" b={<>R$ 412,00 <Bad>Deve</Bad></>} /><Row a="Bruno" b={<>R$ 0,00 <Ok>Em dia</Ok></>} /></Example> },
  { section: 'Cobrança', target: 'bill-receive', page: 'billing', icon: 'wallet', title: 'Diga como você recebe', text: 'Coloque sua chave Pix (CPF, e-mail, celular ou aleatória) e um recado. O app reconhece o tipo e coloca isso no fim de cada cobrança. Com o seu nome, ele ainda gera o Pix copia e cola já com o valor certo de cada pessoa.',
    example: <Example><div className="ex-code">Pix (e-mail): ana@email.com · Ana</div><div className="ex-arrow">Pix copia e cola (já com o valor): 00020126…</div></Example> },
  { section: 'Cobrança', target: 'bill-card', page: 'billing', icon: 'copy', title: 'Cobrar sem digitar nada', text: '“Copiar cobrança” gera uma mensagem pronta para colar no WhatsApp. Quando a pessoa pagar, “Marcar tudo como pago” dá baixa em todos os lançamentos dela.',
    example: <Example><div className="ex-code">Oi Ana! Sua parte na fatura de novembro: R$ 412,00</div><div className="ex-arrow">é só colar no WhatsApp</div></Example> },

  { section: 'Dados', target: 'nav-settings', page: 'settings', icon: 'settings', title: 'Dados: o painel de controle', text: 'Aparência, conta, backups e importação ficam aqui. Vou mostrar cada painel.',
    example: <Example><Chips items={['Aparência', 'Conta', 'Cópias', 'Exportar', 'Importar']} /></Example> },
  { section: 'Dados', target: 'set-card', page: 'settings', icon: 'bank', title: 'Diga quando seu cartão fecha', text: 'Informe o dia do vencimento e quantos dias antes a fatura fecha. Aí cada compra vai sozinha para a fatura certa: uma compra de 09/11 com fatura vencendo dia 07 e fechando 7 dias antes entra em Dezembro, não em Novembro.',
    example: <Example><Row a="Vence dia 7 · fecha 7 dias antes" /><div className="ex-arrow">compra de 09/11 → fatura de Dezembro</div></Example> },
  { section: 'Dados', target: 'set-theme', page: 'settings', icon: 'sparkle', title: 'Deixe com a sua cara', text: 'Escolha entre 9 temas e o modo claro, escuro ou automático. A mudança vale na hora. O vermelho dos pendentes é o mesmo em todos os temas.',
    example: <Example><Chips items={['Violeta', 'Verde-petróleo', 'Preto puro', 'Dourado']} /></Example> },
  { section: 'Dados', target: 'set-cloud', page: 'settings', icon: 'cloud', title: 'Sua conta na nuvem', text: 'Entre com o e-mail (sem senha, só um código) para guardar uma cópia segura e usar em outros aparelhos. É opcional, e o app continua funcionando sem internet.',
    example: <Example><div className="ex-code">Seu código de acesso: 123456</div></Example> },
  { section: 'Dados', target: 'set-clean', page: 'settings', icon: 'sparkle', title: 'Robô de limpeza', text: 'Importou do banco e ficou tudo bagunçado? O robô acha os nomes sujos e os repetidos, mostra o antes e o depois, e só muda o que você aprovar. Antes de mexer, o app guarda uma cópia.',
    example: <Example><div className="ex-code">UBER *TRIP 8842</div><div className="ex-arrow">→ Uber (e mais 3 iguais)</div></Example> },
  { section: 'Dados', target: 'set-copias', page: 'settings', icon: 'shield', title: 'Cópias automáticas', text: 'O app guarda sozinho uma cópia por dia e uma antes de qualquer restauração. Se algo der errado, “Voltar para esta” traz os dados de volta.',
    example: <Example><Row a="08/11 · cópia do dia" b="38 lançamentos" /><div className="ex-arrow">Voltar para esta</div></Example> },
  { section: 'Dados', target: 'set-export', page: 'settings', icon: 'download', title: 'Seus dados são seus', text: 'Baixe tudo em CSV (abre no Excel) ou em um backup JSON, e restaure quando quiser. De vez em quando, mande o backup para você mesmo.',
    example: <Example><Chips items={['Baixar CSV', 'Baixar backup', 'Restaurar backup']} /></Example> },
  { section: 'Dados', target: 'set-import', page: 'settings', icon: 'upload', title: 'Traga a sua planilha', text: 'Importe o .xlsx que você já usa: uma aba por fatura, e o nome da aba define o mês. Não tem planilha? Baixe o modelo pronto. Reimportar é seguro, porque lançamentos repetidos são ignorados.',
    example: <Example><Chips items={['Novembro', 'Outubro', 'Setembro']} /><div className="ex-arrow">3 faturas · 112 lançamentos novos</div></Example> },

  { section: 'Pronto', page: 'dashboard', icon: 'check', title: 'Pronto! Por onde começar?', text: 'Você conheceu o app todo. Escolha a primeira ação. O tour fica guardado em Dados > Ajuda para quando quiser rever.' },
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
    setBox({ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: Math.min(rect.height, window.innerHeight * 0.26) + PAD * 2 })
  }, [step.target])

  // Leva o elemento para a parte de cima da tela (o cartão fica embaixo) e mede de novo.
  useLayoutEffect(() => {
    measure()
    const timers = [120, 400, 800].map((delay) => setTimeout(measure, delay))
    const scrollTimer = setTimeout(() => {
      const node = step.target && !/^(fab|nav-)/.test(step.target) ? findTarget(step.target) : null
      if (!node) return
      const top = node.getBoundingClientRect().top
      if (top < window.innerHeight * 0.04 || top > window.innerHeight * 0.2) window.scrollTo({ top: Math.max(0, window.scrollY + top - window.innerHeight * 0.12), behavior: 'smooth' })
    }, 180)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { timers.forEach(clearTimeout); clearTimeout(scrollTimer); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [measure, index, step.target])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') setIndex((n) => Math.min(n + 1, STEPS.length - 1))
      if (event.key === 'ArrowLeft') setIndex((n) => Math.max(n - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const cardAtTop = !!box && box.top > window.innerHeight * 0.5
  return <div className="tour-layer" role="dialog" aria-modal="true" aria-label="Tour do app">
    {box ? <div className="tour-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden="true"><i /></div> : <div className="tour-dim" aria-hidden="true" />}
    <div key={index} className={`tour-card ${cardAtTop ? 'top' : 'bottom'}`}>
      <div className="tour-progress" aria-hidden="true"><i style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} /></div>
      <div className="tour-head"><span className="tour-icon"><Icon name={step.icon} size={24} /></span><span className="tour-section">{step.section}</span><small>{index + 1} de {STEPS.length}</small></div>
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
