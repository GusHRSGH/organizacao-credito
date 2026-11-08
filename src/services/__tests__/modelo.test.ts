// @vitest-environment node
import { describe, expect, it } from 'vitest'
import readExcelFile from 'read-excel-file/node'
import { parseSheet } from '../importXlsx'

describe('modelo-fatura.xlsx', () => {
  it('é aceito pelo importador e a aba de instruções é ignorada', async () => {
    const sheets = await readExcelFile('public/modelo-fatura.xlsx')
    const parsed = sheets.map((s) => parseSheet(s.sheet, s.data as unknown[][])).filter((s) => s && s.rows.length)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.period).toBe('2027-01-01')
    expect(parsed[0]!.rows).toHaveLength(3)
    expect(parsed[0]!.rows[1]).toMatchObject({ installmentNumber: 2, installmentCount: 6, status: 'pending' })
    expect(parsed[0]!.issues).toHaveLength(0)
  })
})
