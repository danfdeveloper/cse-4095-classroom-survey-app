/**
 * CSV generation (RFC 4180) for spreadsheet export. Pure functions, no imports,
 * so they can be tested directly with `node scripts/test-csv.ts`.
 */

/**
 * Leading characters that make Excel / Sheets / LibreOffice treat a cell as a
 * formula. Cells starting with them are prefixed with an apostrophe so a title
 * like "=HYPERLINK(...)" is shown as text, never executed (OWASP "CSV injection").
 */
const FORMULA_START = /^[=+\-@\t\r]/

export type Cell = string | number | null | undefined

/** Escapes one field: neutralizes formulas, then quotes if it contains , " CR or LF. */
export function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Joins rows with CRLF (RFC 4180) and prepends a UTF-8 BOM so Excel detects UTF-8. */
export function toCsv(rows: Cell[][]): string {
  return '﻿' + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n') + '\r\n'
}

/** "Recursion Check: Week 3!" → "recursion-check-week-3" (for file names). */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'survey'
  )
}

/** Local date-time as "YYYY-MM-DD HH:MM:SS", a format spreadsheets parse as a date. */
export function spreadsheetDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export interface ExportQuestion {
  id: string
  question_text: string
}

export interface ExportResponse {
  id: string
  submitted_at: string
  /** question_id → chosen choice text */
  answers: Record<string, string>
}

export interface ExportSurvey {
  id: string
  title: string
  description: string | null
  status: string
  public_slug: string | null
  created_at: string
}

/**
 * Builds the export:
 *   1. a metadata block (field,value rows),
 *   2. a blank row,
 *   3. the response table: response_id, submitted_at, then one column per
 *      question (header = "Q1. question text"), one row per response.
 */
export function buildResultsCsv(
  survey: ExportSurvey,
  questions: ExportQuestion[],
  responses: ExportResponse[],
  exportedAt: Date,
  timeZone: string,
): string {
  const metadata: Cell[][] = [
    ['Survey', survey.title],
    ['Description', survey.description ?? ''],
    ['Status', survey.status],
    ['Survey ID', survey.id],
    ['Public link code', survey.public_slug ?? ''],
    ['Created', spreadsheetDateTime(survey.created_at)],
    ['Exported', spreadsheetDateTime(exportedAt.toISOString())],
    ['Time zone', timeZone],
    ['Responses', responses.length],
    ['Questions', questions.length],
  ]

  const header: Cell[] = [
    'response_id',
    'submitted_at',
    ...questions.map((q, i) => `Q${i + 1}. ${q.question_text}`),
  ]
  const rows: Cell[][] = responses.map((r) => [
    r.id,
    spreadsheetDateTime(r.submitted_at),
    ...questions.map((q) => r.answers[q.id] ?? ''),
  ])

  return toCsv([...metadata, [], header, ...rows])
}
