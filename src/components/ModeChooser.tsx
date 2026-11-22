import { Icon } from './Icon'

/** Primeira vez que abre: a pessoa escolhe ver o app minimalista ou detalhado. Dá para trocar depois no topo ou em Configurações. */
export default function ModeChooser({ onChoose }: { onChoose: (advanced: boolean) => void }) {
  return <div className="modal-backdrop">
    <div className="modal mode-chooser" role="dialog" aria-modal="true" aria-label="Como você prefere ver o app">
      <h2>Como você prefere ver o app?</h2>
      <p className="muted">Dá para trocar quando quiser, no botão do topo.</p>
      <div className="mode-options">
        <button className="mode-option" onClick={() => onChoose(false)}>
          <Icon name="check" size={22} /><b>Minimalista</b><small>Só o essencial: lançar gastos, quanto falta receber e quem deve.</small>
        </button>
        <button className="mode-option" onClick={() => onChoose(true)}>
          <Icon name="pie" size={22} /><b>Detalhado</b><small>Tudo à vista: gráficos, comparações, filtros e metas.</small>
        </button>
      </div>
    </div>
  </div>
}
