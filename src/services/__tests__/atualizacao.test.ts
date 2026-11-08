import { describe, expect, it } from 'vitest'
import { parseBuild, pickApk } from '../../lib/updater'

describe('atualização', () => {
  it('lê o número da versão da tag', () => {
    expect(parseBuild('v1.12')).toBe(12)
    expect(parseBuild('1.7')).toBe(7)
    expect(parseBuild('latest')).toBeNull()
  })
  it('só aceita o APK do próprio repositório', () => {
    const ok = 'https://github.com/GusHRSGH/organizacao-credito/releases/download/v1.5/organizacao-credito-1.5.apk'
    expect(pickApk([{ name: 'organizacao-credito-1.5.apk', browser_download_url: ok }])).toBe(ok)
    expect(pickApk([{ name: 'organizacao-credito-1.5.apk', browser_download_url: 'https://evil.example/organizacao-credito-1.5.apk' }])).toBeNull()
    expect(pickApk([{ name: 'outro.apk', browser_download_url: ok }])).toBeNull()
  })
})
