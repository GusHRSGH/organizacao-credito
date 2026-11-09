import { useEffect, useState } from 'react'
import { Icon, type IconName } from './Icon'

interface Props { onClose: () => void }

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'plus', title: 'Lance um gasto em segundos', text: 'Toque no botão + e preencha: descrição, valor, quem gastou e a categoria. Se foi parcelado, informe as parcelas e o app distribui nas próximas faturas.' },
  { icon: 'upload', title: 'Já tem uma planilha? Importe', text: 'Em Dados, escolha “Importar planilha .xlsx”. Uma aba por fatura. Não tem planilha? Baixe o modelo pronto na mesma tela.' },
  { icon: 'users', title: 'Veja quem deve quanto', text: 'Na aba Cobrança, o app soma o que cada pessoa deve na fatura. Tudo que está pendente aparece em vermelho, e tocar num gráfico leva direto aos lançamentos.' },
  { icon: 'cloud', title: 'Seus dados ficam seguros', text: 'O app guarda cópias automáticas no aparelho. Com uma conta de e-mail em Dados, você também tem uma cópia na nuvem e usa em outros aparelhos.' },
]

/** Passo a passo de boas-vindas, mostrado uma vez e disponível de novo em Dados. */
export default function Tour({ onClose }: Props) {
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1
  const item = STEPS[step]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return <div className="modal-backdrop">
    <div className="modal tour" role="dialog" aria-modal="true" aria-label="Como usar o app">
      <span className="tour-icon"><Icon name={item.icon} size={28} /></span>
      <h2>{item.title}</h2>
      <p>{item.text}</p>
      <div className="tour-dots" aria-hidden="true">{STEPS.map((_, index) => <i key={index} className={index === step ? 'on' : ''} />)}</div>
      <div className="modal-actions">
        {!last && <button className="text-button" onClick={onClose}>Pular</button>}
        {step > 0 && <button className="secondary-button" onClick={() => setStep(step - 1)}>Voltar</button>}
        <button className="primary-button" onClick={() => (last ? onClose() : setStep(step + 1))}>{last ? 'Começar' : 'Próximo'}</button>
      </div>
    </div>
  </div>
}
