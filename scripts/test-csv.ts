/**
 * Unit tests for src/lib/csv.ts (escaping, formula neutralizing, layout).
 * Run: npm run test:csv
 */
import { buildResultsCsv, escapeCell, slugify, toCsv } from '../src/lib/csv.ts'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`}`,
  )
  if (!ok) failures++
}

// Escaping (RFC 4180)
check('plain text unchanged', escapeCell('A base case'), 'A base case')
check('comma → quoted', escapeCell('a, b'), '"a, b"')
check('quote → doubled and quoted', escapeCell('say "hi"'), '"say ""hi"""')
check('newline → quoted', escapeCell('line1\nline2'), '"line1\nline2"')
check('CRLF → quoted', escapeCell('a\r\nb'), '"a\r\nb"')
check('null/undefined → empty', [escapeCell(null), escapeCell(undefined)], ['', ''])
check('numbers unchanged (negative stays numeric)', [escapeCell(42), escapeCell(-1)], ['42', '-1'])
check('unicode kept', escapeCell('Ünïcödé ✓ 日本'), 'Ünïcödé ✓ 日本')

// CSV/formula injection
check('= formula neutralized', escapeCell('=1+1'), "'=1+1")
check('+ formula neutralized', escapeCell('+1'), "'+1")
check('- formula neutralized', escapeCell('-2+3'), "'-2+3")
check('@ formula neutralized', escapeCell('@SUM(A1)'), "'@SUM(A1)")
check('tab-led neutralized', escapeCell('\t=1'), "'\t=1")
check(
  'formula with comma is neutralized then quoted',
  escapeCell('=HYPERLINK("http://x","click")'),
  `"'=HYPERLINK(""http://x"",""click"")"`,
)

// Document
const doc = toCsv([
  ['a', 'b'],
  ['c,d', 'e'],
])
check('UTF-8 BOM first', doc.charCodeAt(0), 0xfeff)
check('CRLF row separators, trailing CRLF', doc.slice(1), 'a,b\r\n"c,d",e\r\n')

check('slugify', slugify('Recursion Check: Week 3! — Ünï'), 'recursion-check-week-3-uni')
check('slugify fallback', slugify('!!!'), 'survey')

// Full layout
const csv = buildResultsCsv(
  {
    id: 's1',
    title: 'Quiz, "1"',
    description: null,
    status: 'closed',
    public_slug: 'abc234',
    created_at: '2026-11-01T15:00:00Z',
  },
  [
    { id: 'q1', question_text: 'Pick one' },
    { id: 'q2', question_text: 'True?' },
  ],
  [
    { id: 'r1', submitted_at: '2026-11-01T15:05:00Z', answers: { q1: 'A, B', q2: 'True' } },
    { id: 'r2', submitted_at: '2026-11-01T15:06:00Z', answers: { q2: 'False' } },
  ],
  new Date('2026-11-02T00:00:00Z'),
  'UTC',
)
const lines = csv.slice(1).split('\r\n')
check('metadata: title escaped', lines[0], 'Survey,"Quiz, ""1"""')
check(
  'metadata: response count',
  lines.find((l) => l.startsWith('Responses,')),
  'Responses,2',
)
check('blank row separates metadata from table', lines[10], '')
check('header row', lines[11], 'response_id,submitted_at,Q1. Pick one,Q2. True?')
check(
  'one row per response, answers escaped',
  lines[12].split(',').slice(0, 1).concat(lines[12].split(',').slice(-3)),
  ['r1', '"A', ' B"', 'True'],
)
check('missing answer → empty cell', lines[13].endsWith(',,False'), true)
check(
  'row count = metadata + blank + header + responses (+ final empty)',
  lines.length,
  10 + 1 + 1 + 2 + 1,
)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
