import { describe, expect, it } from 'vitest'
import { CloudApi, VersionConflictError, decideSync, friendlyAuthError, hashText } from '../cloud'
import type { BackupFile } from '../../types'

const base = { localHash: 'a', localEmpty: false }

describe('decideSync', () => {
  it('envia quando a nuvem está vazia e há dados aqui', () => {
    expect(decideSync({ ...base, cloud: null, last: null })).toBe('upload')
  })
  it('não faz nada quando os dois lados estão vazios', () => {
    expect(decideSync({ localHash: 'x', localEmpty: true, cloud: null, last: null })).toBe('noop')
  })
  it('aparelho vazio nunca apaga a nuvem: baixa', () => {
    expect(decideSync({ localHash: 'x', localEmpty: true, cloud: { version: 3, hash: 'b', empty: false }, last: { version: 3, hash: 'a' } })).toBe('download')
  })
  it('dados iguais só registram a versão', () => {
    expect(decideSync({ ...base, cloud: { version: 2, hash: 'a', empty: false }, last: null })).toBe('record')
  })
  it('primeira vez com dados diferentes pergunta', () => {
    expect(decideSync({ ...base, cloud: { version: 2, hash: 'b', empty: false }, last: null })).toBe('choose')
  })
  it('só este aparelho mudou: envia', () => {
    expect(decideSync({ ...base, cloud: { version: 2, hash: 'b', empty: false }, last: { version: 2, hash: 'old' } })).toBe('upload')
  })
  it('só a nuvem mudou: baixa', () => {
    expect(decideSync({ ...base, cloud: { version: 3, hash: 'b', empty: false }, last: { version: 2, hash: 'a' } })).toBe('download')
  })
  it('os dois mudaram: pergunta', () => {
    expect(decideSync({ ...base, cloud: { version: 3, hash: 'b', empty: false }, last: { version: 2, hash: 'old' } })).toBe('choose')
  })
  it('nada mudou: não faz nada', () => {
    expect(decideSync({ ...base, cloud: { version: 2, hash: 'a', empty: false }, last: { version: 2, hash: 'a' } })).toBe('noop')
  })
})

describe('hashText', () => {
  it('é estável e muda quando o texto muda', () => {
    expect(hashText('abc')).toBe(hashText('abc'))
    expect(hashText('abc')).not.toBe(hashText('abd'))
  })
})

describe('friendlyAuthError', () => {
  it('traduz os erros mais comuns', () => {
    expect(friendlyAuthError(new Error('Token has expired or is invalid'))).toMatch(/Código inválido/)
    expect(friendlyAuthError(new Error('email rate limit exceeded'))).toMatch(/Muitas tentativas/)
  })
})

describe('CloudApi.push', () => {
  const payload = { app: 'organizacao-credito', version: 1, exportedAt: '', data: { invoices: [], transactions: [], people: [], categories: [] } } as BackupFile
  const make = (result: { data: unknown; error: { message: string } | null }) => new CloudApi({ rpc: async () => result } as never)
  it('devolve a nova versão', async () => {
    expect(await make({ data: 4, error: null }).push(payload, 3)).toBe(4)
  })
  it('converte version_conflict em erro próprio', async () => {
    await expect(make({ data: null, error: { message: 'version_conflict' } }).push(payload, 1)).rejects.toBeInstanceOf(VersionConflictError)
  })
})
