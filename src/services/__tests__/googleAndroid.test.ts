import { describe, expect, it } from 'vitest'
import { decodeIdToken, googleError, pkceChallenge } from '../../lib/androidGoogle'

describe('login Google no Android', () => {
  it('gera o desafio PKCE S256 conforme a RFC 7636', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('lê nome e e-mail do id_token', () => {
    const payload = btoa(JSON.stringify({ email: 'a@b.com', name: 'Ana Lima' })).replace(/=+$/, '')
    expect(decodeIdToken(`x.${payload}.y`)).toMatchObject({ email: 'a@b.com', name: 'Ana Lima' })
    expect(decodeIdToken('lixo')).toEqual({})
  })
  it('traduz erros do Google', () => {
    expect(googleError({ error: 'access_denied' }, 'x')).toContain('negado')
    expect(googleError({ error: 'invalid_grant' }, 'x')).toContain('expirou')
    expect(googleError({}, 'padrão')).toBe('padrão')
  })
})
