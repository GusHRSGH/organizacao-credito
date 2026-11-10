import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const MODELO = path.resolve('public/modelo-fatura.xlsx')

/** Abre o app sem conta e fecha o tour da primeira vez. */
async function entrar(page: Page) {
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
  await page.locator('.sidebar').locator(`[data-tour="nav-${area}"]`).click()
}

async function abaConfig(page: Page, nome: string) {
  await irPara(page, 'config')
  await page.getByRole('tab', { name: nome, exact: true }).click()
}

async function importarModelo(page: Page) {
  await irPara(page, 'settings')
  await page.locator('input[type=file][accept^=".xlsx"]').setInputFiles(MODELO)
  await page.getByRole('button', { name: /^Importar \d+ lançamentos/ }).click()
  await expect(page.getByRole('button', { name: /^Importar \d+ lançamentos/ })).toHaveCount(0, { timeout: 10_000 })
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
  await irPara(page, 'settings')
  const csv = 'Estabelecimento;Quando;Quanto;Quem\nPadaria Central;05/11/2026;R$ 23,90;Ana\nPosto Shell;07/11/2026;180,00;Bia\nPagamento recebido;08/11/2026;-500,00;Ana\n'
  await page.locator('input[type=file][accept^=".xlsx"]').setInputFiles({ name: 'extrato.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  const robo = page.getByRole('dialog', { name: 'Robô de importação' })
  await expect(robo).toBeVisible()
  await expect(robo).toContainText('2 lançamentos')
  await robo.getByRole('button', { name: 'Está certo, continuar' }).click()
  await page.getByRole('button', { name: /^Importar 2 lançamentos/ }).click()
  await expect(page.getByRole('button', { name: /^Importar \d+ lançamentos/ })).toHaveCount(0, { timeout: 10_000 })
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
  await page.getByLabel('Chave Pix').fill('ana@email.com')
  await page.getByLabel('Nome de quem recebe').fill('Ana Souza')
  await expect(page.getByText('Reconheci como E-mail')).toBeVisible()
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText('ana@email.com').first()).toBeVisible()
  await page.getByText('Ver como a cobrança termina').click()
  await expect(page.locator('.receiving-preview')).toContainText('Pix copia e cola')
  await page.reload()
  await irPara(page, 'billing')
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
  await expect(robo).toContainText('Dezembro 2026')
  await expect(robo.getByRole('region', { name: 'Resumo da importação' })).toContainText('4 lançamentos')
  await robo.getByLabel('Responsável padrão').fill('Gus')
  await expect(robo.getByLabel('Descrição de Uber')).toBeVisible()
  await expect(robo.getByLabel('Categoria de Uber')).toHaveValue('Transporte')
  await page.screenshot({ path: `test-results/banco-${info.project.name}.png` })
  await robo.getByRole('button', { name: /^Importar 4 lançamentos para Dezembro 2026/ }).click()
  await expect(robo).toContainText('Fatura de Dezembro 2026 pronta')
  await robo.getByRole('button', { name: 'Ver os lançamentos' }).click()
  await expect(page.locator('b:visible', { hasText: 'Padaria Central' }).first()).toBeVisible()
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
