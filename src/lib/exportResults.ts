import { buildResultsCsv, slugify, type ExportResponse } from './csv.ts'
import { supabase } from './supabase.ts'

const PAGE = 1000 // PostgREST's default max rows per request

/** Fetches everything for one survey (API.md §12) and downloads it as a CSV file. */
export async function exportResultsCsv(surveyId: string): Promise<void> {
  const { data: survey, error } = await supabase
    .from('surveys')
    .select(
      'id, title, description, status, public_slug, created_at, questions(id, question_text, position, choices(id, choice_text))',
    )
    .eq('id', surveyId)
    .order('position', { referencedTable: 'questions' })
    .single()
  if (error) throw error

  const choiceText = new Map<string, string>()
  for (const q of survey.questions) for (const c of q.choices) choiceText.set(c.id, c.choice_text)

  // Page through responses so large classes are never truncated.
  const responses: ExportResponse[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error: pageError } = await supabase
      .from('responses')
      .select('id, submitted_at, answers(question_id, choice_id)')
      .eq('survey_id', surveyId)
      .order('submitted_at')
      .order('id')
      .range(from, from + PAGE - 1)
    if (pageError) throw pageError
    for (const r of data) {
      const answers: Record<string, string> = {}
      for (const a of r.answers) {
        answers[a.question_id] = a.choice_id ? (choiceText.get(a.choice_id) ?? '') : ''
      }
      responses.push({ id: r.id, submitted_at: r.submitted_at, answers })
    }
    if (data.length < PAGE) break
  }

  const now = new Date()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const csv = buildResultsCsv(survey, survey.questions, responses, now, timeZone)

  const date = now.toISOString().slice(0, 10)
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(survey.title)}-results-${date}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
