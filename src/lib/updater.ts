import { App } from '@capacitor/app'
import { registerPlugin } from '@capacitor/core'
import { isNative } from './native'

const REPO = 'GusHRSGH/organizacao-credito'
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`
const CHECKED_KEY = 'oc:update-checked'
const SKIPPED_KEY = 'oc:update-skipped'
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

interface ApkInstallerPlugin {
  canInstall(): Promise<{ allowed: boolean }>
  openInstallSettings(): Promise<void>
  installFromUrl(options: { url: string }): Promise<void>
  addListener(event: 'progress', listener: (data: { percent: number }) => void): Promise<{ remove: () => Promise<void> }>
}
const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller')

export interface UpdateInfo { version: string; build: number; url: string; notes: string }

/** Número da versão no formato "v1.N" (N é o número da execução do robô, o mesmo do versionCode do APK). */
export function parseBuild(tag: string) {
  const match = tag.match(/^v?\d+\.(\d+)$/)
  return match ? Number(match[1]) : null
}

/** Escolhe da Release o APK do próprio repositório, ignorando qualquer outro endereço. */
export function pickApk(assets: Array<{ name?: string; browser_download_url?: string }>) {
  return assets.find((asset) => /^organizacao-credito-[\d.]+\.apk$/.test(asset.name ?? '') && (asset.browser_download_url ?? '').startsWith(DOWNLOAD_PREFIX))?.browser_download_url ?? null
}

export async function currentBuild() {
  const info = await App.getInfo()
  return Number(info.build) || 0
}

/** Consulta a última Release; devolve a atualização se for mais nova que a instalada. */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  if (!isNative) return null
  try {
    const last = Number(localStorage.getItem(CHECKED_KEY) ?? 0)
    if (!force && Date.now() - last < CHECK_EVERY_MS) return null
  } catch { /* segue sem cache */ }
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error('Não consegui consultar as versões no GitHub.')
  try { localStorage.setItem(CHECKED_KEY, String(Date.now())) } catch { /* ignora */ }
  const release = await response.json() as { tag_name?: string; body?: string; assets?: Array<{ name?: string; browser_download_url?: string }> }
  const build = parseBuild(release.tag_name ?? '')
  const url = pickApk(release.assets ?? [])
  if (build === null || !url) return null
  if (build <= await currentBuild()) return null
  try { if (!force && localStorage.getItem(SKIPPED_KEY) === String(build)) return null } catch { /* ignora */ }
  return { version: release.tag_name!.replace(/^v/, ''), build, url, notes: release.body ?? '' }
}

export const skipUpdate = (build: number) => { try { localStorage.setItem(SKIPPED_KEY, String(build)) } catch { /* ignora */ } }

export async function installUpdate(info: UpdateInfo, onProgress: (percent: number) => void) {
  const allowed = (await ApkInstaller.canInstall()).allowed
  if (!allowed) { await ApkInstaller.openInstallSettings(); throw new Error('Ative "Permitir desta fonte" para o app, volte e toque em Atualizar de novo.') }
  const listener = await ApkInstaller.addListener('progress', (data) => onProgress(data.percent))
  try { await ApkInstaller.installFromUrl({ url: info.url }) } finally { await listener.remove() }
}
