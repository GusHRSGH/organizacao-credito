import { useEffect } from 'react'

interface Props { onClose: () => void }

/** Termos de uso e política de privacidade, em linguagem simples. */
export default function Legal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal legal" role="dialog" aria-modal="true" aria-label="Termos de uso e privacidade">
      <h2>Termos de uso e privacidade</h2>
      <p className="hint">Atualizado em novembro de 2026. Em linguagem simples.</p>

      <h3>O que é o app</h3>
      <p>A Cadence ajuda você a acompanhar faturas de cartão: lançamentos, parcelas, quem deve quanto e o que falta pagar. Ele é gratuito e não se conecta ao seu banco nem ao seu cartão.</p>

      <h3>O que fica guardado</h3>
      <ul>
        <li><b>Neste aparelho:</b> tudo o que você lança ou importa (descrições, valores, datas, pessoas, categorias). Funciona sem internet.</li>
        <li><b>Na nuvem, só se você criar conta:</b> seu e-mail e uma cópia desses mesmos dados, numa área que só a sua conta enxerga.</li>
        <li>O app <b>nunca pede</b> senha de banco, número de cartão ou CPF. Não digite essas informações nas descrições.</li>
      </ul>

      <h3>Para que usamos</h3>
      <p>Somente para o app funcionar: entrar na sua conta, sincronizar seus aparelhos e guardar sua cópia. Não vendemos, não compartilhamos e não usamos seus dados para publicidade.</p>

      <h3>Onde ficam na nuvem</h3>
      <p>Num banco de dados do Supabase, em servidores no Brasil (São Paulo). O envio do código de acesso passa por um provedor de e-mail.</p>

      <h3>Seus direitos</h3>
      <ul>
        <li><b>Levar seus dados:</b> em Dados, baixe o backup (JSON) ou o CSV quando quiser.</li>
        <li><b>Apagar tudo:</b> em Dados &gt; Conta na nuvem, “Excluir minha conta” apaga sua conta e a cópia na nuvem. Os dados do aparelho ficam até você apagá-los.</li>
        <li><b>Corrigir ou tirar dúvidas:</b> abra uma conversa em github.com/GusHRSGH/organizacao-credito (aba Issues).</li>
      </ul>

      <h3>Combinados</h3>
      <ul>
        <li>Use o app para organizar as suas próprias finanças.</li>
        <li>Os cálculos e relatórios são uma ajuda, não substituem a fatura oficial do banco.</li>
        <li>É software em evolução, oferecido como está. Faça backups de vez em quando. O app guarda cópias automáticas e permite baixar um arquivo.</li>
        <li>Podemos atualizar estes termos; mudanças importantes serão avisadas no app.</li>
      </ul>
      <div className="modal-actions"><button className="primary-button" onClick={onClose}>Entendi</button></div>
    </div>
  </div>
}
