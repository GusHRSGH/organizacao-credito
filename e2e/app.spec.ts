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
async function irPara(page: Page, area: 'dashboard' | 'invoices' | 'billing' | 'settings') {
  const barra = page.locator('.tabbar')
  const menu = (await barra.isVisible()) ? barra : page.locator('.sidebar')
  await menu.locator(`[data-tour="nav-${area}"]`).click()
}

async function importarModelo(page: Page) {
  await irPara(page, 'settings')
  await page.locator('input[type=file][accept=".xlsx"]').setInputFiles(MODELO)
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
  let passos = 1
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
  await irPara(page, 'settings')
  const tema = page.getByRole('radio', { name: /Verde-petróleo/ })
  await tema.click()
  await expect(tema).toHaveAttribute('aria-checked', 'true')
  await page.reload()
  await irPara(page, 'settings')
  await expect(page.getByRole('radio', { name: /Verde-petróleo/ })).toHaveAttribute('aria-checked', 'true')
})

test('nenhuma tela tem rolagem horizontal', async ({ page }) => {
  await entrar(page)
  await importarModelo(page)
  for (const area of ['dashboard', 'invoices', 'billing', 'settings'] as const) {
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
