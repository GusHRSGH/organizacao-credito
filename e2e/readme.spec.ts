import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

// Prints do README com dados fictícios (e2e/fixtures/demo-backup.json, gerado por scripts/demo-backup.ts).
// Só roda com README_SHOTS=1: npx playwright test e2e/readme.spec.ts
test.skip(!process.env.README_SHOTS, 'só para gerar os prints do README')
test.use({ colorScheme: 'dark' })

const OUT = path.resolve('docs/screenshots')
const BACKUP = path.resolve('e2e/fixtures/demo-backup.json')

async function abrir(page: Page, modo: 'simples' | 'avançado', tema: 'dark' | 'light') {
  await page.addInitScript(([advanced, theme]) => {
    if (localStorage.getItem('oc:seeded')) return
    localStorage.setItem('oc:seeded', '1')
    localStorage.setItem('oc:modo', 'escolhido')
    localStorage.setItem('oc:nudge-until', String(Date.now() + 864e5))
    localStorage.setItem('oc:settings', JSON.stringify({ advanced }))
    localStorage.setItem('oc:mode', theme as string)
    localStorage.setItem('oc:cartao', JSON.stringify({ dueDay: 10, closingDaysBefore: 7, limit: 8000 }))
    localStorage.setItem('oc:cartao:inter', JSON.stringify({ dueDay: 5, closingDaysBefore: 7 }))
    localStorage.setItem('oc:cartao:moto', JSON.stringify({ dueDay: 15, closingDaysBefore: 0 }))
    localStorage.setItem('oc:recebimento', JSON.stringify({ key: 'chacun@exemplo.com', holder: 'Exemplo da Silva', city: 'SAO PAULO', note: '', include: true }))
  }, [modo === 'avançado', tema] as const)
  await page.goto('/')
  await page.getByRole('button', { name: 'Continuar sem conta' }).click()
  await page.getByRole('button', { name: 'Pular' }).click()
  await ir(page, 'settings')
  page.once('dialog', (dialog) => void dialog.accept())
  await page.locator('input[type=file][accept^=".json"]').setInputFiles(BACKUP)
  await expect(page.getByText(/restaurado/i).first()).toBeVisible()
  // Tira os avisos da frente para o print ficar limpo.
  await page.locator('.notice, [role=status]').getByRole('button', { name: 'Fechar' }).first().click({ timeout: 3000 }).catch(() => undefined)
  await page.getByRole('button', { name: 'Depois' }).first().click({ timeout: 3000 }).catch(() => undefined)
}

async function ir(page: Page, area: string) {
  const barra = page.locator('.tabbar')
  if (await barra.isVisible()) {
    if (area !== 'settings') { await barra.locator(`[data-tour="nav-${area}"]`).click(); return }
    await barra.locator('[data-tour="nav-more"]').click()
  }
  const item = page.locator('.sidebar').locator(`[data-tour="nav-${area}"]`)
  const mais = page.locator('.sidebar .nav-more-toggle')
  if (!(await item.isVisible()) && await mais.isVisible()) await mais.click()
  await item.click()
}

const foto = async (page: Page, nome: string) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/${nome}.png` }) }

test('prints do celular', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  await abrir(page, 'simples', 'dark')
  await ir(page, 'dashboard')
  await expect(page.getByText(/todas as carteiras/).first()).toBeVisible()
  await foto(page, 'celular-inicio')

  await ir(page, 'billing')
  const ana = page.locator('.bill-card', { has: page.locator('.bill-name b', { hasText: /^Ana/ }) }).first()
  await ana.getByRole('button', { name: 'Ver outros cartões' }).click()
  await ana.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, -80))
  await foto(page, 'celular-cobranca')

  await ir(page, 'invoices')
  await page.getByRole('button', { name: 'Mais formas de lançar' }).click()
  await page.getByRole('menuitem', { name: /Colar fatura/ }).click()
  await page.getByLabel('Texto da fatura').fill('Fatura Aberta\nVencimento 10 de dezembro\nSUPERMERCADO BOM PRECO\nR$ 455,12\n06 de novembro - 10:12\nFARMACIA CENTRAL 2/3\nR$ 48,50\n14 de outubro - 18:40\nPADARIA TRIGO\nR$ 38,60\n23 de novembro - 08:05')
  await page.locator('.paste-dest').evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.evaluate(() => window.scrollBy(0, -20))
  await foto(page, 'celular-colar')

  await ir(page, 'dashboard')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('button', { name: /^Carteira: / }).click()
  await foto(page, 'celular-carteiras')
})

test('prints do computador', async ({ page }, info) => {
  test.skip(info.project.name !== 'computador')
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrir(page, 'avançado', 'light')
  await ir(page, 'dashboard')
  await expect(page.getByRole('region', { name: 'Limite do cartão' })).toBeVisible()
  await foto(page, 'computador-visao-geral')
  await ir(page, 'billing')
  await foto(page, 'computador-cobranca')
})
