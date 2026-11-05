import type { SurveyListItem, SurveyStatus } from './surveys.ts'

export type DateRange = 'any' | '7d' | '30d' | '90d' | 'custom'

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  any: 'Any time',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  custom: 'Custom range',
}

export interface SurveyFilters {
  query: string
  status: SurveyStatus | 'all'
  range: DateRange
  /** yyyy-mm-dd (local), only used when range = 'custom' */
  from: string
  to: string
}

export const DEFAULT_FILTERS: SurveyFilters = {
  query: '',
  status: 'all',
  range: 'any',
  from: '',
  to: '',
}

const DAYS: Partial<Record<DateRange, number>> = { '7d': 7, '30d': 30, '90d': 90 }

/** Parses a yyyy-mm-dd input value as local midnight (not UTC). */
function localDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/** Inclusive [start, end) bounds on created_at for the selected range, in local time. */
export function dateBounds(f: SurveyFilters, now = new Date()): { start?: Date; end?: Date } {
  const days = DAYS[f.range]
  if (days) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
    return { start }
  }
  if (f.range === 'custom') {
    const start = localDate(f.from) ?? undefined
    const toDay = localDate(f.to)
    const end = toDay
      ? new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1)
      : undefined
    return { start, end }
  }
  return {}
}

export function filterSurveys(
  surveys: SurveyListItem[],
  f: SurveyFilters,
  now = new Date(),
): SurveyListItem[] {
  const q = f.query.trim().toLowerCase()
  const { start, end } = dateBounds(f, now)
  return surveys.filter((s) => {
    if (f.status !== 'all' && s.status !== f.status) return false
    if (q && !s.title.toLowerCase().includes(q)) return false
    const created = new Date(s.created_at)
    if (start && created < start) return false
    if (end && created >= end) return false
    return true
  })
}

export const isFiltered = (f: SurveyFilters) =>
  f.query.trim() !== '' || f.status !== 'all' || f.range !== 'any'

// --- URL search-param round trip, so filters survive navigation & bookmarks ---

const STATUS_VALUES = ['all', 'draft', 'active', 'closed', 'archived']
const RANGE_VALUES = Object.keys(DATE_RANGE_LABELS)

export function filtersFromParams(params: URLSearchParams): SurveyFilters {
  const status = params.get('status') ?? 'all'
  const range = params.get('range') ?? 'any'
  return {
    query: params.get('q') ?? '',
    status: (STATUS_VALUES.includes(status) ? status : 'all') as SurveyFilters['status'],
    range: (RANGE_VALUES.includes(range) ? range : 'any') as DateRange,
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  }
}

export function filtersToParams(f: SurveyFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.query) p.set('q', f.query)
  if (f.status !== 'all') p.set('status', f.status)
  if (f.range !== 'any') p.set('range', f.range)
  if (f.range === 'custom' && f.from) p.set('from', f.from)
  if (f.range === 'custom' && f.to) p.set('to', f.to)
  return p
}
