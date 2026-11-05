/** Phase 14: "Test CSV export" (download, strict parse, and LibreOffice Calc when installed). */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { login, Seeder } from './helpers.ts'

/** Independent RFC 4180 parser (deliberately not the app's own code). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [],
    field = '',
    quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
    } else field += ch
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

let seed: Seeder
test.beforeEach(async () => {
  seed = await Seeder.create()
})
test.afterEach(async () => seed.cleanup())

test('exports metadata and one escaped row per response', async ({ page }, testInfo) => {
  const s = await seed.survey('CSV: "quotes", commas & Ünïcödé', {
    activate: true,
    description: 'Line one\nLine two, with comma',
    questions: [
      { text: 'Which is true, "really"?', choices: ['A base case, always', '=1+1', 'Multi\nline'] },
      { text: '=HYPERLINK("http://evil","click")', type: 'true_false', choices: ['True', 'False'] },
    ],
  })
  for (const [i, p] of [
    [0, 0],
    [1, 1],
    [2, 0],
  ].entries()) {
    await seed.respond(s, `csv${i}`, p)
    await new Promise((r) => setTimeout(r, 1100)) // distinct, ordered timestamps
  }
  const ids = (
    await seed.sb.from('responses').select('id').eq('survey_id', s.id).order('submitted_at')
  ).data!.map((r) => r.id)

  await login(page)
  await page.goto(`/surveys/${s.id}/results`)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(
    /^e2e-csv-quotes-commas-unicode-results-\d{4}-\d{2}-\d{2}\.csv$/,
  )
  const file = join(mkdtempSync(join(tmpdir(), 'csv-')), 'export.csv')
  copyFileSync((await download.path())!, file)
  const raw = readFileSync(file, 'utf8')
  expect(raw.charCodeAt(0)).toBe(0xfeff) // UTF-8 BOM for Excel

  const rows = parseCsv(raw.slice(1))
  const meta = Object.fromEntries(rows.slice(0, 10).map(([k, v]) => [k, v]))
  expect(meta).toMatchObject({
    Survey: '[e2e] CSV: "quotes", commas & Ünïcödé',
    Description: 'Line one\nLine two, with comma',
    Status: 'active',
    'Survey ID': s.id,
    'Public link code': s.slug,
    Responses: '3',
    Questions: '2',
  })
  expect(rows[10]).toEqual([''])
  expect(rows[11]).toEqual([
    'response_id',
    'submitted_at',
    'Q1. Which is true, "really"?',
    'Q2. =HYPERLINK("http://evil","click")',
  ])
  const data = rows.slice(12)
  expect(data.map((r) => r[0])).toEqual(ids)
  for (const r of data) expect(r[1]).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
  expect(data.map((r) => r.slice(2))).toEqual([
    ['A base case, always', 'True'],
    ["'=1+1", 'False'], // formula neutralized
    ['Multi\nline', 'True'],
  ])

  // Open it in a real spreadsheet application when one is available.
  const soffice = [
    '/usr/bin/soffice',
    '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ].find(existsSync)
  if (!soffice || testInfo.project.name !== 'chrome') return
  const out = mkdtempSync(join(tmpdir(), 'ods-'))
  execFileSync(
    soffice,
    ['--headless', '--infilter=CSV:44,34,76,1', '--convert-to', 'ods', '--outdir', out, file],
    { timeout: 120_000 },
  )
  const xml = execFileSync('unzip', ['-p', join(out, 'export.ods'), 'content.xml']).toString()
  expect(xml).not.toMatch(/table:formula=/) // no cell became a formula
  expect(xml).toContain('Ünïcödé')
  expect(xml).toContain('>A base case, always<')
  expect(xml.match(/office:value-type="date"/g)?.length ?? 0).toBeGreaterThanOrEqual(5)
})
