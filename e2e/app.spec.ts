import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const MODELO = path.resolve('public/modelo-fatura.xlsx')

/** Abre o app sem conta e fecha o tour da primeira vez. */
// A escolha entre minimalista e detalhado aparece na primeira abertura; os testes já entram com ela feita, menos o que testa a escolha.
test.beforeEach(async ({ page }, info) => {
  if (!info.title.includes('escolha do modo')) await page.addInitScript(() => { if (!localStorage.getItem('oc:modo')) localStorage.setItem('oc:modo', 'escolhido') })
})

/** Abre uma seção recolhida da cobrança (Como você recebe, Taxa de uso do cartão). */
async function abrirDobra(page: Page, titulo: string) {
  const dobra = page.locator('details.fold', { hasText: titulo })
  if (!(await dobra.evaluate((el) => (el as HTMLDetailsElement).open))) await dobra.locator(':scope > summary').click()
}

async function entrar(page: Page, modo: 'avançado' | 'simples' = 'avançado') {
  // Os testes antigos usam tudo à vista (modo avançado); os do modo simples pedem 'simples'.
  await page.addInitScript((advanced) => { if (!localStorage.getItem('oc:settings')) localStorage.setItem('oc:settings', JSON.stringify({ advanced })) }, modo === 'avançado')
  await page.goto('/')
  await page.getByRole('button', { name: 'Continuar sem conta' }).click()
  await page.getByRole('button', { name: 'Pular' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

/** Navega pela barra de baixo (celular) ou pelo menu lateral (computador). */
async function irPara(page: Page, area: 'dashboard' | 'invoices' | 'billing' | 'goals' | 'config' | 'settings') {
  const barra = page.locator('.tabbar')
  if (await barra.isVisible()) {
    if (area !== 'config' && area !== 'settings') { await barra.locator(`[data-tour="nav-${area}"]`).click(); return }
    await barra.locator('[data-tour="nav-more"]').click()
  }
  const item = page.locator('.sidebar').locator(`[data-tour="nav-${area}"]`)
  // No minimalista, Configurações e Dados ficam no “Mais” da barra lateral.
  const mais = page.locator('.sidebar .nav-more-toggle')
  if (!(await item.isVisible()) && await mais.isVisible()) await mais.click()
  await item.click()
}

async function abaConfig(page: Page, nome: string) {
  await irPara(page, 'config')
  await page.getByRole('tab', { name: nome, exact: true }).click()
}

/** Nas perguntas uma por vez: abre "Ver todos" e vai direto ao resumo. */
async function paraResumo(caixa: ReturnType<Page['getByRole']>) {
  await caixa.getByRole('button', { name: /^Ver todos/ }).click()
  await caixa.getByRole('button', { name: 'Ir para o resumo' }).click()
  await expect(caixa.getByText('Resumo antes de importar')).toBeVisible()
}

/** Responde as perguntas uma por vez até chegar ao resumo; devolve os títulos que apareceram, na ordem. */
async function responder(caixa: ReturnType<Page['getByRole']>, escolhe: (texto: string) => { botao: string | RegExp } | { outra: string }) {
  const passo = caixa.locator('.ask-card')
  const vistos: string[] = []
  for (let i = 0; i < 40; i++) {
    if (!(await passo.count())) break
    const texto = (await passo.textContent()) ?? ''
    vistos.push(texto)
    const resposta = escolhe(texto)
    if ('botao' in resposta) await passo.getByRole('button', { name: resposta.botao, exact: typeof resposta.botao === 'string' }).click()
    else {
      const pessoa = texto.includes('De quem é')
      await passo.getByPlaceholder(pessoa ? 'outra pessoa' : 'outra categoria').fill(resposta.outra)
      await passo.getByRole('button', { name: pessoa ? 'Atribuir' : 'Usar', exact: true }).click()
    }
    await expect(passo.or(caixa.getByText('Resumo antes de importar'))).not.toHaveText(texto)
  }
  await expect(caixa.getByText('Resumo antes de importar')).toBeVisible()
  return vistos
}

/** Planilha lida: confere de quem é cada compra (aceitando os palpites) e importa. */
async function conferirPlanilha(page: Page) {
  await page.getByRole('button', { name: /^Conferir e importar \d+ lançamentos/ }).click()
  const conferir = page.getByRole('dialog', { name: 'Conferir de quem é cada compra' })
  await conferir.getByRole('button', { name: /^Ver todos/ }).click()
  const aceitar = conferir.getByRole('button', { name: /^Aceitar os \d+ palpites/ })
  if (await aceitar.count()) await aceitar.click()
  await conferir.getByRole('button', { name: 'Ir para o resumo' }).click()
  await conferir.getByRole('button', { name: /^Importar \d+ lançamentos/ }).click()
  await expect(conferir).toHaveCount(0, { timeout: 10_000 })
}

/** Planilha fora do padrão: o robô de colunas só pergunta se ficar em dúvida; depois confere quem é quem. */
async function importarCsvRobo(page: Page, csv: string, linhas: number) {
  await irPara(page, 'settings')
  await page.locator('input[type=file][accept^=".xlsx"]').setInputFiles({ name: 'extrato.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  const robo = page.getByRole('dialog', { name: 'Robô de importação' })
  await robo.waitFor({ state: 'detached', timeout: 5_000 }).catch(async () => {
    await robo.getByRole('button', { name: /^Ver todos/ }).click()
    await robo.getByRole('button', { name: 'Ir para o resumo' }).click()
    await robo.getByRole('button', { name: 'Está certo, continuar' }).click()
  })
  await expect(page.getByRole('button', { name: new RegExp(`^Conferir e importar ${linhas} lançamentos`) })).toBeVisible()
  await conferirPlanilha(page)
}

async function importarModelo(page: Page) {
  await irPara(page, 'settings')
  await page.locator('input[type=file][accept^=".xlsx"]').setInputFiles(MODELO)
  await conferirPlanilha(page)
}

test('primeira abertura mostra a entrada, o tour e o estado vazio', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Entrar com e-mail' })).toBeVisible()
  await page.getByRole('button', { name: 'Continuar sem conta' }).click()
  await expect(page.getByRole('dialog', { name: 'Tour do app' })).toBeVisible()
  await page.getByRole('button', { name: 'Pular' }).click()
  await expect(page.getByText('Vamos começar')).toBeVisible()
})

test('o tour percorre todos os passos até as ações finais', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continuar sem conta' }).click()
  await expect(page.getByRole('dialog', { name: 'Tour do app' })).toBeVisible()
  const proximo = page.getByRole('button', { name: 'Próximo' })
  await proximo.click()
  const antes = await page.locator('.tour-card .tour-head small').innerText()
  await page.locator('.tour-spot').first().tap().catch(() => page.locator('.tour-spot').first().click())
  await expect(page.locator('.tour-card .tour-head small')).not.toHaveText(antes)
  let passos = 3
  while (await proximo.count()) { await proximo.click(); passos += 1; expect(passos).toBeLessThan(40) }
  expect(passos).toBeGreaterThanOrEqual(20)
  await expect(page.getByRole('button', { name: 'Lançar meu primeiro gasto' })).toBeVisible()
  await page.getByRole('button', { name: 'Explorar sozinho' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const tamanho of ['normal', 'small', 'xlarge'] as const) {
  test(`o destaque do tour acompanha o elemento com texto ${tamanho}`, async ({ page }) => {
    await page.addInitScript((fontScale) => { try { localStorage.setItem('oc:settings', JSON.stringify({ fontScale })) } catch { /* ignora */ } }, tamanho)
    await page.goto('/')
    await page.getByRole('button', { name: 'Continuar sem conta' }).click()
    await expect(page.getByRole('dialog', { name: 'Tour do app' })).toBeVisible()
    // O tamanho do texto usa zoom no documento: o destaque precisa cair em cima do elemento nessa escala também.
    const medir = () => page.evaluate(() => {
      const spot = document.querySelector<HTMLElement>('.tour-spot[data-tour-target]')
      if (!spot) return null
      const name = spot.getAttribute('data-tour-target')!
      const nodes = [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)]
      const node = nodes.find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth })
      if (!node) return null
      const probe = document.createElement('div')
      probe.style.cssText = 'position:fixed;left:0;top:0;width:100px;height:100px;visibility:hidden'
      spot.parentElement!.appendChild(probe)
      const k = probe.getBoundingClientRect().width / 100
      probe.remove()
      const a = spot.getBoundingClientRect(), b = node.getBoundingClientRect()
      return { name, k, dTop: Math.abs(a.top - (b.top - 8 * k)), dLeft: Math.abs(a.left - (b.left - 8 * k)), dWidth: Math.abs(a.width - (b.width + 16 * k)), dHeight: Math.abs(a.height - (Math.min(b.height, window.innerHeight * 0.45) + 16 * k)) }
    })
    let conferidos = 0
    for (let passo = 0; passo < 14; passo += 1) {
      await page.waitForTimeout(1800)
      const m = await medir()
      if (m) {
        conferidos += 1
        const folga = 2 + m.k
        expect(m.dTop, `topo em ${m.name} (escala ${m.k})`).toBeLessThanOrEqual(folga)
        expect(m.dLeft, `esquerda em ${m.name} (escala ${m.k})`).toBeLessThanOrEqual(folga)
        expect(m.dWidth, `largura em ${m.name} (escala ${m.k})`).toBeLessThanOrEqual(folga)
        expect(m.dHeight, `altura em ${m.name} (escala ${m.k})`).toBeLessThanOrEqual(folga)
      }
      await page.getByRole('button', { name: 'Próximo' }).click()
    }
    expect(conferidos).toBeGreaterThanOrEqual(3)
  })
}

test('o cartão do tour fica por cima da sombra do destaque', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continuar sem conta' }).click()
  await expect(page.getByRole('dialog', { name: 'Tour do app' })).toBeVisible()
  for (let passo = 0; passo < 6; passo += 1) {
    await page.waitForTimeout(700)
    // A sombra do destaque não recebe clique, então o teste compara a ordem de empilhamento: o cartão tem de ficar acima.
    const camadas = await page.evaluate(() => {
      const z = (sel: string) => { const v = getComputedStyle(document.querySelector(sel)!).zIndex; return v === 'auto' ? 0 : Number(v) }
      return { cartao: z('.tour-card'), destaque: document.querySelector('.tour-spot') ? z('.tour-spot') : 0 }
    })
    expect(camadas.cartao, `cartão abaixo da sombra no passo ${passo + 1}`).toBeGreaterThan(camadas.destaque)
    await page.getByRole('button', { name: 'Próximo' }).click()
  }
})

async function campoRapido(page: Page) {
  await irPara(page, 'invoices')
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
  if (!(await campo.isVisible())) await page.locator('[data-tour="fab"]').click()
  return page.locator('input[placeholder*="mercado 150,90"]:visible').first()
}

test('colar a notificação do banco monta o lançamento', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await entrar(page)
  await importarModelo(page)
  const campo = await campoRapido(page)
  await page.evaluate(() => navigator.clipboard.writeText('Compra de R$ 89,90 APROVADA em MERCADO LIVRE'))
  await page.getByRole('button', { name: 'Colar notificação do banco' }).first().click()
  await expect(campo).toHaveValue('Mercado Livre 89,90')
  await expect(page.getByText('Li a notificação do banco').first()).toBeVisible()
  const chips = page.locator('.quick-chips:visible').first()
  await expect(chips).toContainText('Mercado Livre')
  await expect(chips).toContainText('89,90')
})

test('o alerta de meta aparece antes de salvar a compra', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await page.evaluate(() => localStorage.setItem('oc:metas', JSON.stringify([{ id: 't', scope: 'total', name: 'Total', limit: 10 }])))
  const campo = await campoRapido(page)
  await campo.fill('teste meta 50 @ana #casa')
  await expect(page.locator('.quick-alert:visible').first()).toContainText(/limite/)
  await campo.fill('')
  await expect(page.locator('.quick-alert')).toHaveCount(0)
})

test('o microfone preenche o lançamento com o que foi falado', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = ''; interimResults = false; continuous = false
      onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null
      start() { setTimeout(() => { this.onresult?.({ results: [Object.assign([{ transcript: 'mercado 12 vírgula 50 ontem' }], { isFinal: true })] }); this.onend?.() }, 150) }
      stop() { this.onend?.() }
    }
    ;(window as unknown as { SpeechRecognition: unknown; webkitSpeechRecognition: unknown }).SpeechRecognition = FakeRecognition
    ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition
  })
  await entrar(page)
  const campo = await campoRapido(page)
  await page.getByRole('button', { name: 'Falar o gasto' }).first().click()
  await expect(campo).toHaveValue('mercado 12,50 ontem')
})

test('Meu Pluggy: configura, busca a fatura no banco e passa pelo robô', async ({ page }) => {
  const ITEM = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
  await page.route('https://api.pluggy.ai/**', async (route) => {
    const url = route.request().url()
    const json = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.endsWith('/auth')) return json({ apiKey: 'K' })
    if (url.includes('/accounts')) return json({ results: [{ id: 'acc-1', name: 'Nubank', number: 'xxxx1234' }] })
    if (url.includes('/v2/transactions')) return json({ next: null, results: [
      { id: 't1', date: '2026-11-03', description: 'Padaria Pao Quente', amount: 18.5, type: 'DEBIT', status: 'POSTED', creditCardMetadata: { billForecastDate: '2026-12' } },
      { id: 't2', date: '2026-11-04', description: 'Magazine Luiza', amount: 100, type: 'DEBIT', status: 'POSTED', creditCardMetadata: { billForecastDate: '2026-12', installmentNumber: 1, totalInstallments: 3 } },
      { id: 't3', date: '2026-11-05', description: 'Pagamento recebido', amount: -300, type: 'CREDIT', status: 'POSTED', creditCardMetadata: { billForecastDate: '2026-12' } },
    ] })
    return route.fulfill({ status: 404, body: '' })
  })
  await entrar(page)
  await abaConfig(page, 'Avançado')
  await page.getByLabel('Client ID da Pluggy').fill('11111111-2222-4333-8444-555555555555')
  await page.getByLabel('Client Secret da Pluggy').fill('segredo')
  await page.getByLabel('Item IDs da Pluggy').fill(ITEM)
  await page.getByRole('button', { name: 'Salvar e testar' }).click()
  await expect(page.getByText('Achei 1 cartão de crédito').first()).toBeVisible()
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: 'Importar fatura do banco' }).first().click()
  await page.getByRole('button', { name: 'Buscar no banco (Meu Pluggy)' }).click()
  await page.getByRole('button', { name: /Dezembro 2026 · 2 compras/ }).click()
  await expect(page.getByText('Conferi sua fatura')).toBeVisible()
  const banco = page.getByRole('dialog', { name: 'Importar fatura do banco' })
  await paraResumo(banco)
  await banco.getByText(/^Ver a lista completa/).click()
  await expect(page.getByLabel('Descrição de Padaria Pao Quente')).toBeVisible()
  await expect(page.getByText('parcela 1/3').first()).toBeVisible()
  await expect(page.getByLabel('Descrição de Pagamento recebido')).toHaveCount(0)
})

test('no computador, as notificações do celular explicam que são do Android', async ({ page }) => {
  await entrar(page)
  await abaConfig(page, 'Avisos')
  await expect(page.getByText('As notificações do cartão funcionam no app do Android')).toBeVisible()
  await expect(page.getByText('O lembrete diário funciona no app do Android')).toBeVisible()
})

test('importar o modelo de planilha preenche o resumo', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'dashboard')
  await expect(page.getByText(/Falta pagar|Tudo pago/).first()).toBeVisible()
})

test('lançamento rápido cria o gasto na fatura', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
  if (!(await campo.isVisible())) await page.locator('[data-tour="fab"]').click()
  await page.locator('input[placeholder*="mercado 150,90"]:visible').first().fill('teste e2e 12,34 @ana #casa')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await irPara(page, 'invoices')
  await expect(page.getByText('teste e2e').first()).toBeVisible({ timeout: 10_000 })
})

test('o tema escolhido continua depois de recarregar', async ({ page }) => {
  await entrar(page)
  await abaConfig(page, 'Aparência')
  const tema = page.getByRole('radio', { name: /Verde-petróleo/ })
  await tema.click()
  await expect(tema).toHaveAttribute('aria-checked', 'true')
  await page.reload()
  await abaConfig(page, 'Aparência')
  await expect(page.getByRole('radio', { name: /Verde-petróleo/ })).toHaveAttribute('aria-checked', 'true')
})

test('nenhuma tela tem rolagem horizontal', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  for (const area of ['dashboard', 'invoices', 'billing', 'goals', 'config', 'settings'] as const) {
    await irPara(page, area)
    await page.waitForTimeout(400)
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(sobra, `rolagem horizontal em ${area}`).toBeLessThanOrEqual(1)
  }
})

test('a janela de termos abre e fecha', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /termos de uso e a privacidade/ }).click()
  await expect(page.getByRole('dialog', { name: /Termos de uso/ })).toBeVisible()
  await page.getByRole('button', { name: 'Entendi' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a busca global acha lançamentos e abre a fatura', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'dashboard')
  await page.locator('[data-tour="search"]').click()
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('mercado alimentacao')
  await expect(page.getByRole('listbox', { name: 'Resultados' }).getByRole('option').first()).toContainText('Mercado Exemplo')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Faturas e lançamentos' })).toBeVisible()
  await expect(page.locator('b:visible', { hasText: 'Mercado Exemplo' }).first()).toBeVisible()
})

test('salvar um filtro cria um atalho que funciona e pode ser removido', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.getByLabel('Status').selectOption('pending')
  await page.getByRole('button', { name: 'Salvar este filtro' }).click()
  await page.getByLabel('Nome do filtro').fill('Só pendentes')
  await page.locator('.saved-form').getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByLabel('Status').selectOption('')
  await page.getByRole('button', { name: 'Só pendentes', exact: true }).click()
  await expect(page.getByLabel('Status')).toHaveValue('pending')
  await page.getByRole('button', { name: 'Remover o filtro Só pendentes' }).click()
  await expect(page.getByRole('button', { name: 'Só pendentes', exact: true })).toHaveCount(0)
})

test('o resumo em texto aparece na visão geral', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'dashboard')
  await expect(page.locator('[data-tour="dash-insight"]')).toContainText('você gastou')
})

test('o robô entende um CSV fora do padrão e o resumo pode ser ocultado', async ({ page }) => {
  await entrar(page)
  await importarCsvRobo(page, 'Estabelecimento;Quando;Quanto;Quem\nPadaria Central;05/11/2026;R$ 23,90;Ana\nPosto Shell;07/11/2026;180,00;Bia\nPagamento recebido;08/11/2026;-500,00;Ana\n', 2)
  await irPara(page, 'dashboard')
  await expect(page.locator('[data-tour="dash-insight"]')).toContainText('você gastou')
  await page.getByRole('button', { name: 'Ocultar o resumo' }).click()
  await expect(page.locator('[data-tour="dash-insight"]')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('[data-tour="dash-insight"]')).toHaveCount(0)
})

test('a cobrança guarda a chave Pix e leva no fim da mensagem', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'billing')
  await abrirDobra(page, 'Como você recebe')
  await page.getByLabel('Chave Pix').fill('ana@email.com')
  await page.getByLabel('Nome de quem recebe').fill('Ana Souza')
  await expect(page.getByText('Reconheci como E-mail')).toBeVisible()
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText('ana@email.com').first()).toBeVisible()
  await page.getByText('Ver como a cobrança termina').click()
  await expect(page.locator('.receiving-preview')).toContainText('Pix copia e cola')
  await page.reload()
  await irPara(page, 'billing')
  await abrirDobra(page, 'Como você recebe')
  await expect(page.getByText('Pix e-mail: ana@email.com')).toBeVisible()
  await page.getByRole('radio', { name: 'Tudo em aberto' }).click()
  await expect(page.getByText('Total em aberto')).toBeVisible()
})

test('o lançamento rápido entende uma frase falada', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
  if (!(await campo.isVisible())) await page.locator('[data-tour="fab"]').click()
  await page.locator('input[placeholder*="mercado 150,90"]:visible').first().fill('gastei 77,70 em teste falado ontem com a Ana #alimentacao')
  await expect(page.getByText(/teste falado/).first()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Salvo: teste falado, R\$\s?77,70/)).toBeVisible({ timeout: 10_000 })
})

test('o robô de limpeza arruma descrições sujas depois de aprovar', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'invoices')
  for (const texto of ['UBER *TRIP 8842 31,40 @ana #transporte', 'UBER *TRIP 1290 22,10 @ana #transporte']) {
    await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
    const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
    if (!(await campo.isVisible().catch(() => false))) await page.locator('[data-tour="fab"]').click()
    await page.locator('input[placeholder*="mercado 150,90"]:visible').first().fill(texto)
    await page.keyboard.press('Enter')
    await expect(page.getByText(/^Salvo:/)).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')
  }
  await irPara(page, 'settings')
  await page.getByRole('button', { name: 'Procurar bagunça' }).click()
  const robo = page.getByRole('dialog', { name: 'Robô de limpeza' })
  await expect(robo).toContainText('UBER *TRIP')
  await robo.getByRole('button', { name: /^Arrumar \d+/ }).click()
  await expect(page.getByText(/Pronto: \d+ ajustes/)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Procurar bagunça' }).click()
  await expect(page.getByRole('dialog', { name: 'Robô de limpeza' })).toContainText('Tudo certo por aqui')
})

test('o radar avisa cobrança duplicada e deixa ignorar', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'invoices')
  for (let i = 0; i < 2; i++) {
    await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
    const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
    if (!(await campo.isVisible().catch(() => false))) await page.locator('[data-tour="fab"]').click()
    await page.locator('input[placeholder*="mercado 150,90"]:visible').first().fill('Padaria dupla 23,90 @ana #alimentacao')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/^Salvo:/).first()).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')
  }
  await irPara(page, 'dashboard')
  const radar = page.locator('.panel', { has: page.locator('[data-tour="dash-radar"]') })
  await expect(radar).toContainText('Possível cobrança duplicada: Padaria dupla')
  await radar.getByRole('button', { name: /^Ignorar o alerta/ }).click()
  await expect(radar).not.toContainText('Possível cobrança duplicada')
  await expect(page.locator('.panel', { has: page.locator('[data-tour="dash-subs"]') })).toContainText('Assinaturas e custos fixos')
})

async function abrirColar(page: Page) {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: 'Colar fatura' }).click()
}

test('importa uma fatura em PDF pelo leitor', async ({ page }) => {
  const outra = await page.context().newPage()
  await outra.setContent('<body style="font:16px sans-serif"><h1>Fatura</h1><p>05 NOV  SUPERMERCADO PDF TESTE  152,30</p><p>06 NOV  PADARIA PDF TESTE  23,40</p><p>Total da fatura  175,70</p></body>')
  const pdf = await outra.pdf()
  await outra.close()
  await abrirColar(page)
  await page.getByLabel('Arquivo da fatura').setInputFiles({ name: 'fatura.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByText('SUPERMERCADO PDF TESTE').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('PADARIA PDF TESTE').first()).toBeVisible()
})

test('lê o texto de uma foto da fatura', async ({ page }) => {
  test.setTimeout(120_000)
  const outra = await page.context().newPage()
  await outra.setContent('<canvas id="c" width="1100" height="260"></canvas>')
  const url = await outra.evaluate(() => {
    const canvas = document.getElementById('c') as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1100, 260)
    ctx.fillStyle = '#000'; ctx.font = '44px Arial, Helvetica, sans-serif'
    ctx.fillText('05/11 SUPERMERCADO FOTO 152,30', 30, 90)
    ctx.fillText('06/11 PADARIA FOTO 23,40', 30, 180)
    return canvas.toDataURL('image/png')
  })
  await outra.close()
  await abrirColar(page)
  await page.getByLabel('Arquivo da fatura').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') })
  await expect(page.locator('textarea')).toHaveValue(/152[,.]30/, { timeout: 90_000 })
})

test('colar fatura: print do app do banco com valor e data em cinza vira compras', async ({ page }) => {
  test.setTimeout(150_000)
  const outra = await page.context().newPage()
  await outra.setContent('<canvas id="c" width="1080" height="900"></canvas>')
  const url = await outra.evaluate(() => {
    const canvas = document.getElementById('c') as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1080, 900)
    const item = (y: number, name: string, value: string, date: string) => {
      ctx.fillStyle = '#333'; ctx.font = '40px Arial, Helvetica, sans-serif'; ctx.fillText(name, 130, y)
      ctx.fillStyle = '#9a9a9a'; ctx.font = '36px Arial, Helvetica, sans-serif'; ctx.fillText(value, 820, y + 25); ctx.fillText(date, 130, y + 60)
    }
    ctx.fillStyle = '#222'; ctx.font = 'bold 44px Arial'; ctx.fillText('Histórico da fatura', 50, 80)
    item(200, 'PAGAMENTO EFETIVADO', '-R$ 712,09', '01 de novembro - 09:04')
    item(380, 'LOJA FOTO 2/3', 'R$ 263,59', '06 de outubro - 12:06')
    item(560, 'MERCADO FOTO', 'R$ 254,79', '06 de novembro - 10:00')
    return canvas.toDataURL('image/png')
  })
  await outra.close()
  await abrirColar(page)
  await page.getByLabel('Arquivo da fatura').setInputFiles({ name: 'print.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') })
  await expect(page.locator('textarea')).toHaveValue(/254[,.]79/, { timeout: 90_000 })
  await expect(page.getByRole('button', { name: /^Importar 2 / })).toBeVisible()
})

test('lançar o mesmo gasto em vários meses, por frase e pelo seletor', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
  if (!(await campo.isVisible().catch(() => false))) await page.locator('[data-tour="fab"]').click()
  const input = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
  await input.fill('streaming teste 55,90 em janeiro, fevereiro e março @ana #lazer')
  await expect(page.getByText(/em cada: Jan\/27, Fev\/27, Mar\/27/)).toBeVisible()
  await page.getByRole('button', { name: 'Trocar meses' }).click()
  await page.getByRole('button', { name: 'Abr/27', exact: true }).click()
  await expect(page.getByText(/em cada: Jan\/27, Fev\/27, Mar\/27, Abr\/27/)).toBeVisible()
  await input.press('Enter')
  await expect(page.getByText(/Salvo: streaming teste, R\$\s?55,90 em 4 faturas/)).toBeVisible({ timeout: 10_000 })
  await page.keyboard.press('Escape')
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  if (!(await page.locator('input[placeholder*="mercado 150,90"]:visible').first().isVisible().catch(() => false))) await page.locator('[data-tour="fab"]').click()
  await page.locator('input[placeholder*="mercado 150,90"]:visible').first().fill('curso teste 200 2x')
  await expect(page.getByText(/2x de R\$\s?100,00 · Jan\/27, Fev\/27/)).toBeVisible()
})

test('com o cartão configurado, a compra vai para a fatura pelo fechamento', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await abaConfig(page, 'Lançamentos')
  await page.getByLabel('Dia do vencimento').fill('7')
  await page.getByLabel('Dias antes do vencimento').fill('7')
  await page.getByRole('button', { name: 'Salvar', exact: true }).first().click()
  await expect(page.getByText('Ligado: vence dia 7, fecha 7 dias antes.')).toBeVisible()
  await irPara(page, 'invoices')
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  if (!(await page.locator('input[placeholder*="mercado 150,90"]:visible').first().isVisible().catch(() => false))) await page.locator('[data-tour="fab"]').click()
  const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
  await campo.fill('mercado fechamento 50 @ana #alimentacao 09/11/2026')
  await expect(page.locator('select[aria-label="Mês da fatura"]:visible')).toHaveValue('12')
  await campo.fill('mercado fechamento 50 @ana #alimentacao 30/10/2026')
  await expect(page.locator('select[aria-label="Mês da fatura"]:visible')).toHaveValue('11')
})

const NUBANK_CSV = `date,category,title,amount
2026-11-02,restaurante,Padaria Central,23.90
2026-11-03,transporte,Uber *Trip 8842,31.40
2026-11-06,casa,Loja Casa Bela - Parcela 2/6,150.00
2026-11-08,pagamento,Pagamento recebido,-1200.00
2026-11-10,saúde,Farmácia Pague Menos,48.30
`

test('importa a fatura do Nubank com classificação e conferência', async ({ page }, info) => {
  await entrar(page)
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: 'Importar fatura do banco' }).first().click()
  const robo = page.getByRole('dialog', { name: 'Importar fatura do banco' })
  await robo.getByLabel('Arquivo da fatura do banco').setInputFiles({ name: 'Nubank_2026-12-07.csv', mimeType: 'text/csv', buffer: Buffer.from(NUBANK_CSV) })
  await expect(robo).toContainText('4 compras encontradas, 1 linha ignorada')
  await expect(robo.locator('.ask-card')).toBeVisible()
  await paraResumo(robo)
  await expect(robo).toContainText('Dezembro 2026')
  await expect(robo.getByRole('region', { name: 'Resumo da importação' })).toContainText('4 lançamentos')
  await robo.getByLabel('Responsável padrão').fill('Gus')
  await robo.getByText(/^Ver a lista completa/).click()
  await expect(robo.getByLabel('Descrição de Uber')).toBeVisible()
  await expect(robo.getByLabel('Categoria de Uber')).toHaveValue('Transporte')
  await page.screenshot({ path: `test-results/banco-${info.project.name}.png` })
  await robo.getByRole('button', { name: /^Importar 4 lançamentos para Dezembro 2026/ }).click()
  await expect(robo).toContainText('Fatura de Dezembro 2026 pronta')
  await robo.getByRole('button', { name: 'Ver os lançamentos' }).click()
  await expect(page.locator('b:visible', { hasText: 'Padaria Central' }).first()).toBeVisible()
})

const NUBANK_REAL = `date,title,amount
2026-11-10,Pagamento recebido,"- 9,94"
2026-11-09,Uber - NuPay,"9,94"
2026-11-09,IOF de compra internacional,"3,50"
2026-11-09,Servico Ai* Assinatura,"100,00"
2026-11-07,Pagamento recebido,"- 4.182,94"
2026-11-05,Mercado*Mercadolivre,"182,66"
2026-10-31,Pix no Crédito - MARIA SOUZA LIMA - 2/3,"241,37"
2026-10-31,Pix no Crédito - Maria Souza Lima - 3/3,"241,37"
`

test('o robô pergunta uma compra por vez: estorno, parcelas, de quem é e categoria', async ({ page }, info) => {
  await entrar(page)
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: 'Importar fatura do banco' }).first().click()
  const robo = page.getByRole('dialog', { name: 'Importar fatura do banco' })
  await robo.getByLabel('Arquivo da fatura do banco').setInputFiles({ name: 'Nubank_2026-12-07.csv', mimeType: 'text/csv', buffer: Buffer.from(NUBANK_REAL) })
  await expect(robo).toContainText('6 compras encontradas')
  const passo = robo.locator('.ask-card')
  await expect(passo).toContainText('Foi estornada ou cancelada?')
  await page.screenshot({ path: `test-results/robo-perguntas-${info.project.name}.png` })
  await passo.getByRole('button', { name: 'Sim, não importar' }).click()
  await expect(passo).toContainText('parcela que ainda vai vir')
  await passo.getByRole('button', { name: 'Sim, lançar' }).click()
  const vistos = await responder(robo, (texto) => {
    if (texto.includes('Categoria')) return { outra: texto.includes('Mercado Livre') ? 'Compras' : 'Assinaturas' }
    if (texto.includes('MARIA SOUZA LIMA - 2/3')) return { outra: 'Ana' }
    if (texto.includes('Maria Souza Lima - 3/3')) return { outra: 'Bia' }
    return { outra: 'Gus' }
  })
  // Duas parcelas do mesmo Pix são duas perguntas: cada compra tem a sua resposta.
  expect(vistos.filter((texto) => texto.includes('De quem é') && texto.includes('Pix no Crédito'))).toHaveLength(2)
  expect(vistos.some((texto) => texto.includes('Categoria') && texto.includes('Não consegui adivinhar a categoria'))).toBe(true)
  await expect(robo.getByText('Resumo antes de importar')).toBeVisible()
  await expect(robo).toContainText('Lançar a 1 parcela que falta')
  await expect(robo.getByLabel('Quanto cada pessoa deve')).toContainText('Ana')
  await expect(robo.getByLabel('Quanto cada pessoa deve')).toContainText('Bia')
  await robo.getByText(/^Ver a lista completa/).click()
  await expect(robo.getByLabel('Responsável de IOF de compra internacional')).toHaveValue('Gus')
  await expect(robo.getByLabel('Categoria de Mercado Livre')).toHaveValue('Compras')
  await robo.getByRole('button', { name: /^Importar 5 lançamentos para Dezembro 2026/ }).click()
  await expect(robo).toContainText('Fatura de Dezembro 2026 pronta')
  await expect(robo).toContainText('Também lancei 1 parcela futura')
})

test('cria a fatura de qualquer mês, inclusive passado', async ({ page }) => {
  await entrar(page)
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: 'Criar fatura de outro mês…' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Nova fatura' })
  await dialogo.getByRole('button', { name: 'Ano anterior' }).click()
  await dialogo.getByRole('button', { name: /^Março \d{4}$/ }).click()
  await dialogo.getByRole('button', { name: /^Criar fatura de Março \d{4}$/ }).click()
  await expect(page.getByText(/Fatura de Março \d{4} criada\./)).toBeVisible()
})

test('metas: cria um limite e a barra avisa quando passa', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'goals')
  await page.getByLabel('O que limitar').selectOption('total')
  await page.getByLabel('Limite por fatura (R$)').fill('1')
  await page.getByRole('button', { name: 'Criar meta' }).click()
  await expect(page.getByRole('progressbar', { name: 'Total da fatura' })).toBeVisible()
  await expect(page.getByText('Passou do limite').first()).toBeVisible()
  await page.reload()
  await irPara(page, 'goals')
  await expect(page.getByRole('progressbar', { name: 'Total da fatura' })).toBeVisible()
})

test('configurações: esconder valores e itens do menu continuam depois de recarregar', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'dashboard')
  await page.getByRole('button', { name: 'Ocultar os valores' }).click()
  await expect(page.getByText('R$ ••••').first()).toBeVisible()
  await abaConfig(page, 'Menu e início')
  await page.getByLabel(/Mostrar .Metas e limites./).uncheck()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Mostrar os valores' })).toBeVisible()
  const menu = (await page.locator('.tabbar').isVisible()) ? page.locator('.tabbar') : page.locator('.sidebar')
  await expect(menu.locator('[data-tour="nav-goals"]')).toHaveCount(0)
})

test('a previsão estima a fatura aberta a partir das anteriores', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-02-10T12:00:00'))
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'dashboard')
  const painel = page.locator('.panel', { has: page.getByRole('heading', { name: /Previsão da fatura de Fevereiro 2027/ }) })
  await expect(painel).toBeVisible()
  await expect(painel).toContainText('Já lançado')
  await expect(painel).toContainText('média das últimas 1 fatura')
})

test('meta de uma pessoa aparece no gráfico com a linha de limite', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'goals')
  await page.getByLabel('O que limitar').selectOption('person')
  await page.locator('.goal-form select').nth(1).selectOption({ index: 1 })
  await page.getByLabel('Limite por fatura (R$)').fill('1')
  await page.getByRole('button', { name: 'Criar meta' }).click()
  await expect(page.getByRole('heading', { name: 'Pessoas x limite' })).toBeVisible()
  await expect(page.locator('.chart-limit').first()).toBeAttached()
  await page.locator('.panel', { has: page.getByRole('heading', { name: 'Pessoas x limite' }) }).screenshot({ path: 'test-results/limite.png' })
  await page.locator('.panel', { has: page.getByRole('heading', { name: 'Pessoas x limite' }) }).locator('svg g[role=button], svg [tabindex]').first().click()
  await expect(page.getByRole('heading', { name: /Lançamentos|Faturas/ }).first()).toBeVisible()
  await irPara(page, 'dashboard')
  await expect(page.locator('.chart-limit').first()).toBeAttached()
})

test('o lançamento rápido pede mês e ano da fatura e respeita a escolha', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
  if (!(await campo.isVisible())) await page.locator('[data-tour="fab"]').click()
  await page.locator('select[aria-label="Mês da fatura"]:visible').selectOption('08')
  await page.locator('select[aria-label="Ano da fatura"]:visible').selectOption('2027')
  await page.locator('input[placeholder*="mercado 150,90"]:visible').first().fill('escolhida 77,70 @ana #casa')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Salvo: escolhida.*na fatura de Agosto 2027/)).toBeVisible({ timeout: 10_000 })
})

test('conciliação: o que o banco cobrou e eu não lancei entra para conferir', async ({ page }) => {
  await entrar(page)
  await irPara(page, 'invoices')
  const abrir = async (csv: string) => {
    await page.getByRole('button', { name: 'Importar fatura do banco' }).first().click()
    const robo = page.getByRole('dialog', { name: 'Importar fatura do banco' })
    await robo.getByLabel('Arquivo da fatura do banco').setInputFiles({ name: 'Nubank_2026-12-07.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await paraResumo(robo)
    await robo.getByLabel('Responsável padrão').fill('Gus')
    return robo
  }
  let robo = await abrir(NUBANK_CSV)
  await robo.getByRole('button', { name: /^Importar 4 lançamentos/ }).click()
  await robo.getByRole('button', { name: 'Ver os lançamentos' }).click()
  await expect(page.getByText(/4 lançamentos vieram do banco para você conferir/)).toBeVisible()
  await page.getByRole('button', { name: 'Está tudo certo' }).click()
  await expect(page.getByText(/vieram do banco para você conferir/)).toHaveCount(0)

  const segundo = NUBANK_CSV.replace('2026-11-10,saúde,Farmácia Pague Menos,48.30', '2026-11-12,lazer,Cinema Centro,60.00')
  robo = await abrir(segundo)
  const conc = robo.getByRole('region', { name: 'Conciliação com o que você já lançou' })
  await expect(conc).toContainText('Conferem')
  await expect(conc).toContainText('entram para você conferir')
  await expect(conc).toContainText('1 lançamento seu que o banco não cobrou')
  await robo.getByRole('button', { name: /^Importar 1 lançamentos/ }).click()
  await expect(robo).toContainText('pronta')
})

test('o robô pergunta o mês quando o nome do arquivo não diz e o usuário confirma', async ({ page }) => {
  await entrar(page)
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: 'Importar fatura do banco' }).first().click()
  const robo = page.getByRole('dialog', { name: 'Importar fatura do banco' })
  const csv = 'date,title,amount\n2026-10-12,Padaria Central,"23,90"\n2026-10-14,Uber - NuPay,"9,94"\n'
  await robo.getByLabel('Arquivo da fatura do banco').setInputFiles({ name: 'compras.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  const passo = robo.locator('.ask-card')
  await expect(passo).toContainText('Essa fatura é de')
  await expect(passo).toContainText('parece')
  await passo.getByRole('button', { name: /^Sim, / }).click()
  await expect(passo).not.toContainText('Essa fatura é de')
  await expect(passo).toContainText('De quem é')
})

test('o robô confirma os responsáveis que atribuiu pelo histórico: o usuário aceita ou corrige', async ({ page }) => {
  await entrar(page)
  await importarCsvRobo(page, 'Estabelecimento;Quando;Quanto;Quem\nPadaria Central;05/11/2026;R$ 23,90;Ana\nPosto Shell;07/11/2026;180,00;Bia\n', 2)
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: 'Importar fatura do banco' }).first().click()
  const robo = page.getByRole('dialog', { name: 'Importar fatura do banco' })
  const csv = 'date,title,amount\n2026-12-01,Padaria Central,"30,00"\n2026-12-02,Posto Shell,"200,00"\n'
  await robo.getByLabel('Arquivo da fatura do banco').setInputFiles({ name: 'Nubank_2026-12-07.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  // Acertou: aceita o palpite com um toque. Errou: corrige para outra pessoa.
  const vistos = await responder(robo, (texto) => {
    if (texto.includes('Categoria')) return { outra: 'Outros' }
    if (texto.includes('Posto Shell')) return { botao: 'Ana' }
    return { botao: /^Ana/ }
  })
  expect(vistos.some((texto) => texto.includes('Pelo seu histórico, “Padaria Central” costuma ser de Ana'))).toBe(true)
  expect(vistos.some((texto) => texto.includes('Pelo seu histórico, “Posto Shell” costuma ser de Bia'))).toBe(true)
  await robo.getByText(/^Ver a lista completa/).click()
  await expect(robo.getByLabel(/^Responsável de Posto Shell/)).toHaveValue('Ana')
  await expect(robo.getByLabel(/^Responsável de Padaria Central/)).toHaveValue('Ana')
})

test('pagou um valor: o robô deixa pendente o que sobrou e mostra a diferença', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  if (!(await page.locator('input[placeholder*="mercado 150,90"]:visible').first().isVisible())) await page.locator('[data-tour="fab"]').click()
  for (const gasto of ['aluguel 500 @zeca #casa', 'mercado 700 @zeca #casa', 'farmacia 89 @zeca #casa']) {
    const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
    await campo.fill(gasto)
    await page.keyboard.press('Enter')
    await expect(campo).toHaveValue('', { timeout: 10_000 })
  }
  await page.keyboard.press('Escape')
  await irPara(page, 'billing')
  const card = page.locator('.bill-card', { hasText: 'zeca' })
  await expect(card).toContainText('1.289')
  await card.getByRole('button', { name: 'Pagou um valor' }).click()
  await card.getByLabel('Valor pago').fill('1200')
  await expect(card).toContainText('Faltam')
  await expect(card).toContainText('Fecha certinho')
  await expect(card).toContainText('farmacia')
  await expect(card.getByRole('alert')).toHaveCount(0)
  await card.getByLabel('Valor pago').fill('1199,50')
  await expect(card.getByRole('alert')).toContainText('Diferença de')
  await card.getByRole('button', { name: 'Confirmar com a diferença' }).click()
  await expect(card).toContainText('Deve')
  await expect(card).toContainText('89')
  await expect(card.getByRole('button', { name: 'Pagou um valor' })).toBeEnabled()
})

// O arquivo chega com o UTF-8 lido como Latin-1 e salvo de novo ("DescriÃ§Ã£o"), como no relato do beta tester.
test('extrato da conta do Nubank com acento quebrado: usa a descrição e ignora investimento', async ({ page }) => {
  await entrar(page)
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: 'Importar fatura do banco' }).first().click()
  const robo = page.getByRole('dialog', { name: 'Importar fatura do banco' })
  const csv = ['Data,Valor,Identificador,Descrição',
    '"04/11/2026","-44.89","6aeb5db6-0b9e-4b12-85ff-609f64f08e81","Compra no débito - MERCADO TESTE"',
    '"05/11/2026","-600","6aedec22-c491-4b12-85ff-609f64f08e82","Aplicação RDB"',
    '"06/11/2026","-70","6aee1223-ff37-4b12-85ff-609f64f08e83","Plano Nucel - Conta"'].join('\n')
  await robo.getByLabel('Arquivo da fatura do banco').setInputFiles({ name: 'NU_000_01NOV2026_30NOV2026.csv', mimeType: 'text/csv', buffer: Buffer.from(Buffer.from(csv, 'utf8').toString('latin1'), 'utf8') })
  await expect(robo.locator('.ask-card')).toBeVisible()
  await paraResumo(robo)
  await robo.getByText(/^Ver a lista completa/).click()
  await expect(robo.getByLabel(/^Descrição de Compra no débito/)).toBeVisible()
  await expect(robo).not.toContainText('6aeb5db6')
  await expect(robo).toContainText('Importar 2 lançamentos')
})

test('PDF do extrato da conta: importa o que saiu e deixa de fora o investimento', async ({ page }) => {
  const outra = await page.context().newPage()
  await outra.setContent('<body style="font:14px sans-serif"><p>Data Valor Identificador Descrição</p>'
    + '<p>04/11/2026 -44,89 6aeb5db6-0b9e-4b Compra no débito - MERCADO EXTRATO TESTE</p>'
    + '<p>05/11/2026 -600 6aedec22-c491-4f Aplicação RDB</p>'
    + '<p>06/11/2026 2180,06 6aedacd6-9027-48 Transferência recebida pelo Pix - EMPRESA TESTE</p>'
    + '<p>07/11/2026 -70 6aee1223-ff37-49 Plano Nucel - Conta</p></body>')
  const pdf = await outra.pdf()
  await outra.close()
  await abrirColar(page)
  await page.getByLabel('Arquivo da fatura').setInputFiles({ name: 'NU_000_01NOV2026_14NOV2026.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByText('MERCADO EXTRATO TESTE').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Plano Nucel').first()).toBeVisible()
  // A aplicação aparece só na lista de linhas ignoradas: entram 2 lançamentos (o mercado e o plano).
  await expect(page.getByRole('button', { name: /^Importar 2 / })).toBeVisible()
})

test('planilha sem data: o robô aceita "Não tem data" e pergunta o mês', async ({ page }) => {
  await entrar(page)
  await irPara(page, 'settings')
  const csv = 'Orçamento - Dezembro/2026;\nDescrição;Valor\nAluguel;1200\nMercado;850,40\nInternet;99,90\n'
  await page.locator('input[type=file][accept^=".xlsx"]').setInputFiles({ name: 'orcamento.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  const robo = page.getByRole('dialog', { name: 'Robô de importação' })
  await expect(robo.getByText('Qual coluna tem data?')).toBeVisible()
  await robo.getByRole('button', { name: /Não tem data/ }).click()
  await expect(robo.getByText('De que mês são esses valores?')).toBeVisible()
  await robo.getByRole('button', { name: /Dezembro 2026/ }).click()
  await robo.getByRole('button', { name: 'Está certo, continuar' }).click()
  await expect(page.getByRole('button', { name: /^Conferir e importar 3 lançamentos/ })).toBeVisible()
})

test('colar: dá para importar sem responsável padrão e sem conferir antes', async ({ page }) => {
  await abrirColar(page)
  await page.getByLabel('Texto da fatura').fill('01/12/2026 Dinheiro emprestado teste 465,00')
  await expect(page.getByText(/1 linha vai sem responsável/)).toBeVisible()
  await page.getByRole('button', { name: /^Importar 1/ }).click()
  await expect(page.getByText(/1 lançamentos importados/)).toBeVisible()
})

test('taxa de uso do cartão: divide pelo gasto, entra na cobrança e é paga junto', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  if (!(await page.locator('input[placeholder*="mercado 150,90"]:visible').first().isVisible())) await page.locator('[data-tour="fab"]').click()
  for (const gasto of ['notebook taxa 1500 @gusta #casa', 'mercado taxa 900 @lia #casa', 'farmacia taxa 600 @rui #casa']) {
    const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
    await campo.fill(gasto)
    await page.keyboard.press('Enter')
    await expect(campo).toHaveValue('', { timeout: 10_000 })
  }
  await page.keyboard.press('Escape')
  await irPara(page, 'billing')
  await abrirDobra(page, 'Taxa de uso do cartão')
  const taxa = page.getByRole('region', { name: 'Taxa de uso do cartão' })
  await taxa.getByLabel('Nome da taxa').fill('Taxa de manutenção teste')
  await taxa.getByRole('radio', { name: 'Porcentagem' }).click()
  await taxa.getByLabel('Valor da taxa').fill('2')
  await expect(taxa.getByText(/Ex\.: com 2%, Gusta \(gastou R\$\s1\.500,00\) paga R\$\s30,00/)).toBeVisible()
  await taxa.getByRole('radio', { name: 'Valor fixo' }).click()
  await taxa.getByLabel('Valor da taxa').fill('100')
  await taxa.getByRole('button', { name: 'Salvar taxa' }).click()
  // Proporcional ao gasto: 1500, 900 e 600 de 3000 → 50, 30 e 20 (os outros do modelo também entram).
  const gusta = page.locator('.bill-card', { hasText: 'gusta' })
  await expect(gusta).toContainText('+ taxa')
  const parte = taxa.getByLabel('Parte de gusta')
  const antes = await parte.inputValue()
  await parte.fill('10')
  await parte.press('Enter')
  await expect(taxa.getByRole('button', { name: 'Voltar ao calculado' })).toBeVisible()
  await expect(taxa).toContainText(/Total da taxa: R\$\s100/)
  await taxa.getByRole('button', { name: 'Voltar ao calculado' }).click()
  await expect(parte).toHaveValue(antes)
  page.once('dialog', (dialog) => void dialog.accept())
  await gusta.getByRole('button', { name: 'Marcar tudo como pago' }).click()
  await expect(taxa.getByLabel('Taxa de gusta paga')).toBeChecked({ timeout: 10_000 })
})

test('cobrança: Compartilhar Pix manda só o copia e cola e Enviar detalhes vai sem a chave', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  // No celular abre o compartilhar do sistema; aqui ele é trocado por uma captura do texto.
  await page.addInitScript(() => {
    const sent: string[] = []
    ;(window as unknown as { __shared: string[] }).__shared = sent
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: { text: string }) => { sent.push(data.text) } })
  })
  const ultimo = async () => {
    const shared = await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared.at(-1) ?? '')
    return shared || page.evaluate(() => navigator.clipboard.readText())
  }
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'billing')
  const card = page.locator('.bill-card').first()
  // Sem chave cadastrada: o botão leva ao cadastro.
  await card.getByRole('button', { name: 'Compartilhar Pix' }).click()
  await expect(page.getByText('Cadastre sua chave Pix')).toBeVisible()
  await expect(page.getByLabel('Chave Pix')).toBeFocused()
  await page.getByLabel('Chave Pix').fill('teste@email.com')
  await page.getByLabel('Nome de quem recebe').fill('Gus Teste')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await card.getByRole('button', { name: 'Compartilhar Pix' }).click()
  await expect.poll(ultimo).toMatch(/^000201[^\n]*6304[0-9A-F]{4}$/)
  await card.getByRole('button', { name: 'Enviar detalhes' }).click()
  await expect.poll(ultimo).toContain('É só copiar o Pix que te mandei.')
  expect(await ultimo()).not.toContain('teste@email.com')
})

test('limite de cada pessoa: extra na taxa de quem passou e aviso ao lançar', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  if (!(await page.locator('input[placeholder*="mercado 150,90"]:visible').first().isVisible())) await page.locator('[data-tour="fab"]').click()
  for (const gasto of ['notebook limite 1500 @gusta #casa', 'mercado limite 700 @lia #casa']) {
    const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
    await campo.fill(gasto)
    await page.keyboard.press('Enter')
    await expect(campo).toHaveValue('', { timeout: 10_000 })
  }
  await page.keyboard.press('Escape')
  await irPara(page, 'billing')
  await abrirDobra(page, 'Taxa de uso do cartão')
  const taxa = page.getByRole('region', { name: 'Taxa de uso do cartão' })
  await taxa.getByLabel('Valor da taxa').fill('100')
  await taxa.getByLabel('Porcentagem extra por passar do limite').fill('10')
  await taxa.getByRole('button', { name: 'Salvar taxa' }).click()
  await taxa.getByRole('button', { name: 'Definir limites' }).click()
  await taxa.getByLabel('Limite de Gusta').fill('1200')
  await taxa.getByLabel('Limite de Gusta').press('Enter')
  await expect(taxa).toContainText(/Passou do limite: \+ R\$\s150,00 de taxa extra/)
  await taxa.getByLabel('Limite de Lia').fill('800')
  await taxa.getByLabel('Limite de Lia').press('Enter')
  await expect(taxa).toContainText(/Perto do limite: pode gastar mais R\$\s100,00/)
  await irPara(page, 'invoices')
  if (!(await page.locator('input[placeholder*="mercado 150,90"]:visible').first().isVisible())) await page.locator('[data-tour="fab"]').click()
  await page.locator('input[placeholder*="mercado 150,90"]:visible').first().fill('farmacia limite 150 @lia #casa')
  await expect(page.locator('.quick-alert:visible', { hasText: 'vai passar do limite' }).first()).toContainText('taxa extra de 10%')
})

test('mês quitado: comemora na hora, manda o resumo pro grupo, vai para o histórico e pode ser apagado', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => {
    const sent: string[] = []
    ;(window as unknown as { __shared: string[] }).__shared = sent
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: { text: string }) => { sent.push(data.text) } })
  })
  const ultimo = async () => (await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared.at(-1) ?? '')) || page.evaluate(() => navigator.clipboard.readText())
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'billing')
  page.on('dialog', (dialog) => void dialog.accept())
  const cards = page.locator('.bill-card')
  await expect(cards.first()).toBeVisible()
  for (let i = 0; i < 6; i++) {
    const botao = page.locator('.bill-card button:enabled', { hasText: 'Marcar tudo como pago' }).first()
    if (!(await botao.count())) break
    await botao.click()
    await page.waitForTimeout(300)
  }
  await expect(cards.first()).toBeVisible()
  const festa = page.getByRole('dialog', { name: /quitada/ })
  await expect(festa).toContainText('quitada!')
  await festa.getByRole('button', { name: 'Enviar mensagem pro grupo' }).click()
  await expect.poll(ultimo).toContain('quitada! Obrigado a todos')
  await festa.getByRole('button', { name: 'Fechar' }).click()
  await expect(page.getByText('✓ Quitada')).toBeVisible()
  const lista = page.locator('details.settled-list')
  await lista.locator('summary').click()
  await lista.getByRole('button', { name: 'Apagar' }).first().click()
  await expect(page.getByText(/apagada\. Dá para restaurar/)).toBeVisible()
  await expect(page.locator('details.settled-list')).toHaveCount(0)
})


test('modo simples: início enxuto, menu de formas de lançar, filtros escondidos e card de cobrança com o essencial', async ({ page }) => {
  await entrar(page, 'simples')
  await importarModelo(page)
  await irPara(page, 'dashboard')
  await expect(page.getByRole('heading', { name: 'Quem deve' })).toBeVisible()
  await expect(page.getByText('Fatura mês a mês')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cobrar' }).first()).toBeVisible()
  await irPara(page, 'invoices')
  await expect(page.getByRole('button', { name: 'Importar fatura do banco' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Mais formas de lançar' }).click()
  await expect(page.getByRole('menuitem', { name: /Importar fatura do banco/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Criar fatura de outro mês/ })).toBeVisible()
  await expect(page.getByPlaceholder('Buscar lançamento')).toHaveCount(0)
  await page.getByRole('button', { name: 'Buscar e filtrar' }).click()
  await expect(page.getByPlaceholder('Buscar lançamento')).toBeVisible()
  await irPara(page, 'billing')
  const card = page.locator('.bill-card').first()
  await expect(card.getByRole('button', { name: 'Compartilhar Pix' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Marcar tudo como pago' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Pagou um valor' })).toHaveCount(0)
  await card.getByRole('button', { name: 'Mais opções' }).click()
  await expect(card.getByRole('button', { name: 'Pagou um valor' })).toBeVisible()
  await expect(page.locator('details.fold', { hasText: 'Como você recebe' })).toBeVisible()
  // O detalhado volta com um toque, no botão do topo.
  await page.getByRole('button', { name: 'Trocar para o modo detalhado' }).click()
  await irPara(page, 'dashboard')
  await expect(page.getByText('Fatura mês a mês')).toBeVisible()
  await page.getByRole('button', { name: 'Trocar para o modo minimalista' }).click()
  await expect(page.getByText('Fatura mês a mês')).toHaveCount(0)
})


test('escolha do modo na primeira abertura e lista minimalista que abre ao tocar', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continuar sem conta' }).click()
  const escolha = page.getByRole('dialog', { name: 'Como você prefere ver o app' })
  await expect(escolha).toBeVisible()
  await escolha.getByRole('button', { name: /Minimalista/ }).click()
  await expect(page.getByRole('dialog', { name: 'Tour do app' })).toBeVisible()
  await page.getByRole('button', { name: 'Pular' }).click()
  await importarModelo(page)
  await irPara(page, 'invoices')
  const linha = page.locator('.tx-min li').first()
  await expect(linha.getByRole('button', { name: /Pago|Pendente/ })).toHaveCount(0)
  await linha.locator('.tx-min-row').click()
  await expect(linha.getByRole('button', { name: /Pago|Pendente/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Como você prefere ver o app' })).toHaveCount(0)
})

test('a gaveta do menu no celular vai até o fim da tela, sem faixa embaixo', async ({ page }) => {
  test.skip(test.info().project.name !== 'celular', 'Só existe gaveta no celular')
  await entrar(page)
  await page.locator('.tabbar [data-tour="nav-more"]').click()
  const sidebar = page.locator('.sidebar')
  await expect(sidebar).toBeInViewport()
  await page.waitForTimeout(400)
  const box = await sidebar.boundingBox()
  const height = await page.evaluate(() => window.innerHeight)
  expect(box!.y).toBeLessThanOrEqual(0.5)
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(height - 0.5)
})

test('lista começa pelo último adicionado e fatura quitada tem botão de apagar', async ({ page }) => {
  await entrar(page, 'simples')
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  if (!(await page.locator('input[placeholder*="mercado 150,90"]:visible').first().isVisible())) await page.locator('[data-tour="fab"]').click()
  const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
  await campo.fill('compra antiga recente 10 @ana #casa 02/01')
  await page.keyboard.press('Enter')
  await expect(campo).toHaveValue('', { timeout: 10_000 })
  await page.keyboard.press('Escape')
  await irPara(page, 'invoices')
  await expect(page.locator('.tx-min li').first()).toContainText('antiga recente')
  // Quitar tudo e apagar pela Visão geral.
  await irPara(page, 'billing')
  page.on('dialog', (dialog) => void dialog.accept())
  await expect(page.locator('.bill-card').first()).toBeVisible()
  for (let i = 0; i < 6; i++) {
    const botao = page.locator('.bill-card button:enabled', { hasText: 'Marcar tudo como pago' }).first()
    if (!(await botao.count())) break
    await botao.click()
    await page.waitForTimeout(300)
  }
  const festa = page.getByRole('dialog', { name: /quitada/ })
  if (await festa.isVisible()) await festa.getByRole('button', { name: 'Fechar' }).click()
  await irPara(page, 'dashboard')
  await page.getByRole('button', { name: 'Apagar fatura' }).click()
  await expect(page.getByText(/apagada\. Dá para restaurar/)).toBeVisible()
})

test('carteiras: criar outro cartão no topo, lançar nele e voltar para o principal sem misturar', async ({ page }) => {
  await entrar(page, 'simples')
  await importarModelo(page)
  await irPara(page, 'invoices')
  const total = page.locator('.tx-min li')
  await expect(total.first()).toBeVisible()
  const antes = await total.count()
  await page.getByRole('button', { name: /^Carteira: / }).click()
  await page.getByRole('button', { name: /Nova carteira/ }).click()
  await page.getByLabel('Nome da nova carteira').fill('Credifatto Teste')
  await page.getByLabel('Nome da nova carteira').press('Enter')
  await expect(page.getByRole('button', { name: 'Carteira: Credifatto Teste. Trocar de carteira' })).toBeVisible()
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  if (!(await page.locator('input[placeholder*="mercado 150,90"]:visible').first().isVisible())) await page.locator('[data-tour="fab"]').click()
  const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
  await campo.fill('farmacia credifatto 42 @ana #saude')
  await page.keyboard.press('Enter')
  await expect(campo).toHaveValue('', { timeout: 10_000 })
  await page.keyboard.press('Escape')
  await irPara(page, 'invoices')
  await expect(page.locator('.tx-min li')).toHaveCount(1)
  await page.getByRole('button', { name: /^Carteira: / }).click()
  await page.getByRole('menuitemradio', { name: /Cartão principal/ }).click()
  await expect(page.locator('.tx-min li')).toHaveCount(antes)
  await expect(page.getByText('farmacia credifatto')).toHaveCount(0)
})

test('empréstimos: cadastrar com % extra, ver a parcela no mês e apagar com as parcelas', async ({ page }) => {
  await entrar(page, 'simples')
  await page.getByRole('button', { name: /^Carteira: / }).click()
  await page.getByRole('button', { name: /Novo empréstimo/ }).click()
  const form = page.getByRole('dialog', { name: 'Novo empréstimo' })
  await form.getByLabel('Nome').fill('Carro Teste')
  await form.getByLabel('Quem paga').fill('Bia')
  await form.getByLabel('Valor da parcela (R$)').fill('520')
  await form.getByLabel('Quantas parcelas faltam').fill('12')
  await form.getByLabel('Sua % extra (opcional)').fill('2')
  await expect(form.locator('.loan-preview')).toContainText('530,40')
  await form.getByRole('button', { name: 'Criar empréstimo' }).click()
  await expect(page.getByRole('button', { name: 'Carteira: Carro Teste. Trocar de carteira' })).toBeVisible()
  await irPara(page, 'invoices')
  await expect(page.getByText('Carro Teste - Parcela 1/12')).toBeVisible()
  await irPara(page, 'billing')
  await expect(page.getByText('Taxa de uso do cartão')).toHaveCount(0)
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: /^Carteira: / }).click()
  await page.getByRole('button', { name: 'Apagar Carro Teste' }).click()
  await expect(page.getByRole('button', { name: /^Carteira: Cartão principal/ })).toBeVisible()
})

test('cobrança unificada: soma cartão e empréstimo por pessoa no Início e na Cobrança', async ({ page }) => {
  await entrar(page, 'simples')
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: /^Carteira: / }).click()
  await page.getByRole('button', { name: /Novo empréstimo/ }).click()
  const form = page.getByRole('dialog', { name: 'Novo empréstimo' })
  await form.getByLabel('Nome').fill('Moto Teste')
  await form.getByLabel('Quem paga').fill('Pessoa Empréstimo')
  await form.getByLabel('Valor da parcela (R$)').fill('300')
  await form.getByRole('button', { name: 'Criar empréstimo' }).click()
  await expect(page.getByRole('button', { name: 'Carteira: Moto Teste. Trocar de carteira' })).toBeVisible()
  await irPara(page, 'dashboard')
  await expect(page.getByText(/Falta receber em .* \(todas as carteiras\)/)).toBeVisible()
  await irPara(page, 'billing')
  await abrirDobra(page, 'Todas as carteiras')
  const pessoa = page.locator('.unified-list > li', { hasText: 'Pessoa Empréstimo' })
  await expect(pessoa).toContainText('Moto Teste')
  await expect(pessoa).toContainText('300,00')
  await expect(pessoa).toContainText('faltam 11')
  await expect(pessoa.getByRole('button', { name: 'Pix do total' })).toBeVisible()
})

test('colar fatura: acha o vencimento e manda tudo para a fatura desse mês', async ({ page }) => {
  await abrirColar(page)
  await page.getByLabel('Texto da fatura').fill('Fatura Aberta\nVencimento 10 de dezembro\nLOJA DESTINO 2/3\nR$ 50,00\n06 de outubro - 10:00\nMERCADO DESTINO\nR$ 30,00\n06 de novembro - 10:00')
  await expect(page.getByText(/Achei o vencimento/)).toBeVisible()
  await expect(page.getByLabel('Fatura de destino').locator('option:checked')).toContainText('Dezembro')
  await page.getByRole('button', { name: /^Importar 2 / }).click()
  await expect(page.getByLabel('Fatura', { exact: true }).locator('option:checked')).toContainText('Dezembro')
  await expect(page.locator('text=MERCADO DESTINO >> visible=true').first()).toBeVisible()
})

test('cobrança: quem também deve em outro cartão mostra os outros cartões e o total', async ({ page }) => {
  await entrar(page, 'simples')
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: /^Carteira: / }).click()
  await page.getByRole('button', { name: /Nova carteira/ }).click()
  await page.getByLabel('Nome da nova carteira').fill('Cartão B')
  await page.getByLabel('Nome da nova carteira').press('Enter')
  await expect(page.getByRole('button', { name: 'Carteira: Cartão B. Trocar de carteira' })).toBeVisible()
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  if (!(await page.locator('input[placeholder*="mercado 150,90"]:visible').first().isVisible())) await page.locator('[data-tour="fab"]').click()
  const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
  await campo.fill('farmacia cartao b 42 @ana #saude em janeiro')
  await page.keyboard.press('Enter')
  await expect(campo).toHaveValue('', { timeout: 10_000 })
  await page.keyboard.press('Escape')
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: /^Carteira: / }).click()
  await page.getByRole('menuitemradio', { name: /Cartão principal/ }).click()
  await irPara(page, 'billing')
  const ana = page.locator('.bill-card', { has: page.locator('.bill-name b', { hasText: /^Ana/ }) }).first()
  await expect(ana.getByText(/Também deve em outro cartão/)).toBeVisible()
  await ana.getByRole('button', { name: 'Ver outros cartões' }).click()
  await expect(ana.getByRole('list', { name: /Onde Ana/ })).toContainText('Cartão B')
  await ana.getByRole('button', { name: 'Cobrar todos' }).click()
  await expect(ana.getByRole('group', { name: 'Como mandar a cobrança' })).toContainText('Cada compra')
  await ana.getByRole('button', { name: 'Cancelar' }).click()
  await ana.getByRole('button', { name: 'Compartilhar Pix' }).click()
  const pix = ana.getByRole('group', { name: 'Qual Pix mandar' })
  await expect(pix.getByRole('button', { name: /^Todos somados/ })).toBeVisible()
  await expect(pix.getByRole('button', { name: /^Só deste cartão/ })).toBeVisible()
})

test('fatura vazia: aparece o botão de apagar', async ({ page }) => {
  await entrar(page, 'simples')
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: /^Carteira: / }).click()
  await page.getByRole('button', { name: /Nova carteira/ }).click()
  await page.getByLabel('Nome da nova carteira').fill('Cartão Vazio')
  await page.getByLabel('Nome da nova carteira').press('Enter')
  await expect(page.getByRole('button', { name: 'Carteira: Cartão Vazio. Trocar de carteira' })).toBeVisible()
  await page.getByLabel('Fatura', { exact: true }).selectOption('__nova')
  const dialog = page.getByRole('dialog', { name: 'Nova fatura' })
  await dialog.getByRole('button', { name: /^Criar fatura de/ }).click()
  await expect(page.getByText('Esta fatura não tem lançamentos.')).toBeVisible()
  page.once('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: 'Apagar fatura' }).click()
  await expect(page.getByLabel('Fatura', { exact: true }).locator('option:checked')).toHaveText('Nenhuma fatura')
})

test('cobrança: pagou tudo em todas as carteiras e sobra vira crédito', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: /^Carteira: / }).click()
  await page.getByRole('button', { name: /Nova carteira/ }).click()
  await page.getByLabel('Nome da nova carteira').fill('Cartão C')
  await page.getByLabel('Nome da nova carteira').press('Enter')
  await expect(page.getByRole('button', { name: 'Carteira: Cartão C. Trocar de carteira' })).toBeVisible()
  await page.locator('input[placeholder*="mercado 150,90"]:visible, .fab:visible').first().waitFor()
  if (!(await page.locator('input[placeholder*="mercado 150,90"]:visible').first().isVisible())) await page.locator('[data-tour="fab"]').click()
  const campo = page.locator('input[placeholder*="mercado 150,90"]:visible').first()
  await campo.fill('farmacia cartao c 42 @ana #saude em janeiro')
  await page.keyboard.press('Enter')
  await expect(campo).toHaveValue('', { timeout: 10_000 })
  await page.keyboard.press('Escape')
  await irPara(page, 'invoices')
  await page.getByRole('button', { name: /^Carteira: / }).click()
  await page.getByRole('menuitemradio', { name: /Cartão principal/ }).click()
  await irPara(page, 'billing')
  const card = (nome: RegExp) => page.locator('.bill-card', { has: page.locator('.bill-name b', { hasText: nome }) }).first()
  await card(/^Ana/).getByRole('button', { name: 'Ver outros cartões' }).click()
  page.once('dialog', (d) => void d.accept())
  await card(/^Ana/).getByRole('button', { name: /^Pagou tudo/ }).click()
  await expect(card(/^Ana/).locator('.bill-due')).toContainText('Em dia')
  await expect(card(/^Ana/).getByText(/Também deve em outro cartão/)).toHaveCount(0)
  // Outra pessoa manda mais do que deve: a sobra vira crédito.
  const outro = page.locator('.bill-card', { has: page.locator('.bill-due', { hasText: 'Deve' }) }).first()
  await outro.getByRole('button', { name: 'Pagou um valor' }).click()
  await outro.getByLabel('Valor pago').fill('99999')
  await expect(outro.getByText(/ficam de crédito/)).toBeVisible()
  await outro.getByRole('button', { name: 'Marcar como pago' }).click()
  await expect(page.locator('.bill-credit').first()).toContainText('crédito')
})

test('colar fatura: dois prints de uma vez viram uma lista só, sem repetir', async ({ page }) => {
  test.setTimeout(180_000)
  const outra = await page.context().newPage()
  await outra.setContent('<canvas id="c" width="1080" height="560"></canvas>')
  const desenhar = (itens: Array<[string, string, string]>) => outra.evaluate((lista) => {
    const canvas = document.getElementById('c') as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1080, 560)
    lista.forEach(([name, value, date], i) => {
      const y = 100 + i * 220
      ctx.fillStyle = '#333'; ctx.font = '40px Arial'; ctx.fillText(name, 130, y)
      ctx.fillStyle = '#9a9a9a'; ctx.font = '36px Arial'; ctx.fillText(value, 820, y + 25); ctx.fillText(date, 130, y + 60)
    })
    return canvas.toDataURL('image/png').split(',')[1]
  }, itens)
  const um = await desenhar([['LOJA PRIMEIRA', 'R$ 11,00', '01 de novembro - 10:00'], ['LOJA SEGUNDA', 'R$ 22,00', '02 de novembro - 10:00']])
  const dois = await desenhar([['LOJA SEGUNDA', 'R$ 22,00', '02 de novembro - 10:00'], ['LOJA TERCEIRA', 'R$ 33,00', '03 de novembro - 10:00']])
  await outra.close()
  await abrirColar(page)
  await page.getByLabel('Arquivo da fatura').setInputFiles([
    { name: 'print1.png', mimeType: 'image/png', buffer: Buffer.from(um, 'base64') },
    { name: 'print2.png', mimeType: 'image/png', buffer: Buffer.from(dois, 'base64') },
  ])
  await expect(page.locator('textarea')).toHaveValue(/próxima imagem[\s\S]*33[,.]00/, { timeout: 150_000 })
  await expect(page.getByRole('button', { name: /^Importar 3 / })).toBeVisible()
})
