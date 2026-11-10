import { Icon } from './Icon'
import { Panel } from './ui'
import { useInsightVisible } from '../lib/prefs'
import { useAppearance, type ThemeMode } from '../lib/theme'
import { PALETTES, tokensFor } from '../lib/themes'

export default function AppearancePanel() {
  const { mode, palette, theme, setMode, setPalette } = useAppearance()
  const modes: { id: ThemeMode; label: string; icon: 'sun' | 'moon' | 'sparkle' }[] = [{ id: 'auto', label: 'Automático', icon: 'sparkle' }, { id: 'light', label: 'Claro', icon: 'sun' }, { id: 'dark', label: 'Escuro', icon: 'moon' }]
  const [insight, setInsight] = useInsightVisible()
  return <Panel tour="set-theme" icon="sparkle" title="Aparência" subtitle="Escolha o visual do app. A mudança vale na hora e fica salva neste aparelho.">
    <div className="mode-switch" role="radiogroup" aria-label="Modo">
      {modes.map((item) => <button key={item.id} role="radio" aria-checked={mode === item.id} className={mode === item.id ? 'on' : ''} onClick={() => setMode(item.id)}><Icon name={item.icon} size={16} />{item.label}</button>)}
    </div>
    <div className="theme-grid" role="radiogroup" aria-label="Tema">
      {PALETTES.map((item) => {
        const t = tokensFor(item, theme)
        const on = palette === item.id
        return <button key={item.id} role="radio" aria-checked={on} className={`theme-card ${on ? 'on' : ''}`} onClick={() => setPalette(item.id)}>
          <span className="theme-preview" style={{ background: t['--bg'] }}>
            <span className="side" style={{ background: t['--sidebar'] }}><i style={{ background: t['--primary'] }} /><i style={{ background: t['--muted'] }} /><i style={{ background: t['--muted'] }} /></span>
            <span className="body"><span className="row"><i style={{ background: t['--surface'], flex: 1, border: `1px solid ${t['--line']}` }} /><i style={{ background: t['--primary'], width: 22 }} /></span><i style={{ background: t['--bad'], width: '46%' }} /><i style={{ background: t['--surface-2'], width: '70%' }} /></span>
          </span>
          <span className="theme-name">{item.name}{on && <Icon name="check" size={16} />}</span>
        </button>
      })}
    </div>
    <label className="check"><input type="checkbox" checked={insight} onChange={(event) => setInsight(event.target.checked)} />Mostrar o resumo em texto na Visão geral (“Em novembro você gastou…”)</label>
    <p className="hint">{theme === 'light' && palette === 'amoled' ? 'O preto puro só aparece no modo escuro; no claro, o app usa o branco. ' : ''}O vermelho dos pendentes é sempre o mesmo, em qualquer tema.</p>
  </Panel>
}
