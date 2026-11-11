import { useEffect, useRef, useState, type ReactNode } from 'react'
import AppearancePanel from '../components/AppearancePanel'
import CardPanel from '../components/CardPanel'
import SecurityPanel from '../components/SecurityPanel'
import { PageHeading, Panel } from '../components/ui'
import { formatDate, messageOf, money } from '../lib/format'
import { exportSettings, importSettings, resetSettings, useSettings, type Settings } from '../lib/settings'
import { downloadText, stamp } from '../services/exporters'
import { agendarLembrete, lembreteDisponivel, readLembrete, writeLembrete, type Lembrete } from '../lib/lembrete'

const TABS = [['aparencia', 'Aparência'], ['menu', 'Menu e início'], ['formatos', 'Formatos'], ['lancamentos', 'Lançamentos'], ['privacidade', 'Privacidade'], ['avisos', 'Avisos'], ['avancado', 'Avançado']] as const
type Tab = typeof TABS[number][0]
const TAB_KEY = 'oc:config-tab'

function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return <div className="seg-field"><span className="seg-label">{label}</span><div className="seg" role="radiogroup" aria-label={label}>{options.map(([id, text]) => <button key={String(id)} role="radio" aria-checked={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{text}</button>)}</div></div>
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{children}</label>
}

function DailyReminder({ notify }: { notify: Props['notify'] }) {
  const [config, setConfig] = useState<Lembrete>(readLembrete)
  const time = `${String(config.hour).padStart(2, '0')}:${String(config.minute).padStart(2, '0')}`
  async function apply(next: Lembrete) {
    setConfig(next); writeLembrete(next)
    const result = await agendarLembrete(next)
    if (result === 'negado') { const off = { ...next, on: false }; setConfig(off); writeLembrete(off); notify('error', 'Permita as notificações do Chacun nas configurações do aparelho para receber o lembrete.') }
    else if (result === 'ok') notify('notice', `Lembrete diário ligado para ${String(next.hour).padStart(2, '0')}:${String(next.minute).padStart(2, '0')}.`)
  }
  return <Panel icon="clock" title="Lembrete diário" subtitle="Uma notificação por dia para você lançar os gastos. Sem custo e sem servidor.">
    {lembreteDisponivel() ? <>
      <Toggle checked={config.on} onChange={(on) => void apply({ ...config, on })}>Lembrar de lançar os gastos todo dia</Toggle>
      <label className="time-field">Horário
        <input type="time" value={time} disabled={!config.on} aria-label="Horário do lembrete" onChange={(event) => { const [hour, minute] = event.target.value.split(':').map(Number); if (Number.isInteger(hour) && Number.isInteger(minute)) void apply({ ...config, hour, minute }) }} /></label>
      <p className="hint">Se você já lançou algo no dia, o lembrete daquele dia não aparece. Tocar na notificação abre o lançamento.</p>
    </> : <p className="hint">O lembrete diário funciona no app do Android. Instale o app no celular para usar.</p>}
  </Panel>
}

interface Props { people: string[]; categories: string[]; notify: (kind: 'notice' | 'error', text: string) => void }

export default function Config({ people, categories, notify }: Props) {
  const [settings, set] = useSettings()
  const [tab, setTab] = useState<Tab>(() => { try { const saved = sessionStorage.getItem(TAB_KEY); return TABS.some(([id]) => id === saved) ? (saved as Tab) : 'aparencia' } catch { return 'aparencia' } })
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onTab = (event: Event) => { const next = (event as CustomEvent<string>).detail; if (TABS.some(([id]) => id === next)) setTab(next as Tab) }
    window.addEventListener('oc:config-tab', onTab)
    return () => window.removeEventListener('oc:config-tab', onTab)
  }, [])
  const choose = (next: Tab) => { setTab(next); try { sessionStorage.setItem(TAB_KEY, next) } catch { /* ignora */ } }
  const patch = (value: Partial<Settings>) => set(value)

  async function loadFile(file?: File) {
    if (!file) return
    try { importSettings(await file.text()); notify('notice', 'Configurações carregadas.') } catch (cause) { notify('error', messageOf(cause)) }
    if (fileRef.current) fileRef.current.value = ''
  }

  return <>
    <PageHeading title="Configurações" subtitle="Deixe o app do seu jeito. Tudo é salvo neste aparelho e vale na hora." />
    <div className="tabs" role="tablist" aria-label="Seções das configurações">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => choose(id)}>{label}</button>)}</div>

    {tab === 'aparencia' && <>
      <AppearancePanel />
      <Panel icon="sparkle" title="Texto e densidade" subtitle="Ajuste para ler melhor ou para ver mais coisas de uma vez.">
        <Seg label="Tamanho do texto" value={settings.fontScale} options={[['small', 'Pequeno'], ['normal', 'Normal'], ['large', 'Grande'], ['xlarge', 'Bem grande']]} onChange={(fontScale) => patch({ fontScale })} />
        <Seg label="Densidade das listas" value={settings.density} options={[['comfortable', 'Confortável'], ['compact', 'Compacta']]} onChange={(density) => patch({ density })} />
        <Toggle checked={settings.reduceMotion} onChange={(reduceMotion) => patch({ reduceMotion })}>Reduzir animações e movimentos</Toggle>
      </Panel>
    </>}

    {tab === 'menu' && <>
      <Panel icon="dashboard" title="Tela inicial" subtitle="Onde o app abre.">
        <Seg label="Abrir em" value={settings.startPage} options={[['dashboard', 'Visão geral'], ['invoices', 'Faturas'], ['billing', 'Cobrança'], ['goals', 'Metas']]} onChange={(startPage) => patch({ startPage })} />
      </Panel>
      <Panel icon="menu" title="Itens do menu" subtitle="Esconda o que você não usa. Visão geral, Faturas, Configurações e Dados e backup ficam sempre.">
        <Toggle checked={settings.showBilling} onChange={(showBilling) => patch({ showBilling })}>Mostrar “Quem deve quanto”</Toggle>
        <Toggle checked={settings.showGoals} onChange={(showGoals) => patch({ showGoals })}>Mostrar “Metas e limites”</Toggle>
      </Panel>
      <Panel icon="search" title="Atalhos do teclado" subtitle="No computador.">
        <ul className="shortcuts"><li><kbd>Ctrl</kbd> + <kbd>N</kbd> novo gasto</li><li><kbd>Ctrl</kbd> + <kbd>K</kbd> ou <kbd>/</kbd> buscar em todas as faturas</li><li><kbd>Ctrl</kbd> + <kbd>H</kbd> ocultar ou mostrar os valores</li></ul>
      </Panel>
    </>}

    {tab === 'formatos' && <Panel icon="receipt" title="Como mostrar datas e valores" subtitle="Só muda a exibição; os dados não mudam.">
      <Seg label="Data" value={settings.dateStyle} options={[['full', formatDateExample('full')], ['short', formatDateExample('short')]]} onChange={(dateStyle) => patch({ dateStyle })} />
      <Seg label="Centavos" value={settings.cents ? 'on' : 'off'} options={[['on', 'Mostrar (R$ 1.234,56)'], ['off', 'Arredondar (R$ 1.235)']]} onChange={(value) => patch({ cents: value === 'on' })} />
      <p className="hint">Exemplo agora: {money(1234.56)} em {formatDate('2026-11-09')}. Mensagens de cobrança copiadas para o WhatsApp sempre levam os centavos.</p>
    </Panel>}

    {tab === 'lancamentos' && <>
      <CardPanel notify={notify} />
      <Panel icon="user" title="Padrões ao lançar" subtitle="Usados no lançamento rápido quando você não escreve @pessoa ou #categoria e o app não reconhece pelo histórico.">
        <div className="card-grid">
          <label>Responsável padrão<select value={settings.defaultPerson} onChange={(event) => patch({ defaultPerson: event.target.value })}><option value="">Nenhum (lembrar o último)</option>{people.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label>Categoria padrão<select value={settings.defaultCategory} onChange={(event) => patch({ defaultCategory: event.target.value })}><option value="">Nenhuma (lembrar a última)</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></label>
        </div>
      </Panel>
    </>}

    {tab === 'privacidade' && <>
      <Panel icon="lock" title="Ocultar valores" subtitle="Útil quando alguém está olhando a sua tela.">
        <Toggle checked={settings.hideValues} onChange={(hideValues) => patch({ hideValues })}>Esconder todos os valores em R$ (aparece “R$ ••••”)</Toggle>
        <p className="hint">Atalho: o botão do olho no topo da tela, ou Ctrl + H no computador.</p>
      </Panel>
      <SecurityPanel notify={notify} />
      <Panel icon="shield" title="Seus dados">
        <p className="hint">Tudo fica neste aparelho. Nada é enviado para fora a não ser que você ligue a conta na nuvem em Dados e backup.</p>
      </Panel>
    </>}

    {tab === 'avisos' && <><DailyReminder notify={notify} /><Panel icon="clock" title="Avisos dentro do app" subtitle="Aparecem no topo das telas quando você abre o app. Sem notificações do sistema e sem custo.">
      <Seg label="Fatura perto de vencer" value={settings.remindDue} options={[[0, 'Desligado'], [1, '1 dia'], [3, '3 dias'], [7, '7 dias']]} onChange={(remindDue) => patch({ remindDue })} />
      <p className="hint">Precisa do cartão configurado em Lançamentos. Só avisa se ainda houver valor pendente.</p>
      <Toggle checked={settings.remindDebts} onChange={(remindDebts) => patch({ remindDebts })}>Avisar quando alguém ainda não pagou faturas anteriores</Toggle>
      <Toggle checked={settings.remindGoals} onChange={(remindGoals) => patch({ remindGoals })}>Avisar quando uma meta chegar perto do limite ou estourar</Toggle>
    </Panel></>}

    {tab === 'avancado' && <Panel icon="download" title="Backup das configurações" subtitle="Leve o seu jeito de usar para outro aparelho.">
      <div className="button-row">
        <button className="secondary-button" onClick={() => downloadText(`configuracoes-${stamp()}.json`, exportSettings(), 'application/json')}>Baixar configurações</button>
        <button className="secondary-button" onClick={() => fileRef.current?.click()}>Carregar configurações…</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(event) => void loadFile(event.target.files?.[0])} />
        <button className="text-button" onClick={() => { if (window.confirm('Voltar todas as configurações ao padrão? Seus lançamentos não mudam.')) { resetSettings(); notify('notice', 'Configurações restauradas.') } }}>Restaurar o padrão</button>
      </div>
      <p className="hint">Metas, cartão e o tema não entram neste arquivo. Os lançamentos ficam no backup de Dados e backup.</p>
    </Panel>}
  </>
}

function formatDateExample(style: Settings['dateStyle']) {
  return style === 'full' ? '09/11/2026' : '09/11/26'
}

