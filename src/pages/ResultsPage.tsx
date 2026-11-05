import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import AppHeader from '../components/AppHeader.tsx'
import ChoiceBarChart from '../components/ChoiceBarChart.tsx'
import StatusBadge from '../components/StatusBadge.tsx'
import {
  formatPercent,
  getSurveyResults,
  type QuestionResult,
  type SurveyResults,
} from '../lib/results.ts'
import { buttonPrimary, buttonSecondary } from '../lib/styles.ts'
import { friendlyError } from '../lib/surveys.ts'

const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
})
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function ResultsPage() {
  const { id = '' } = useParams()
  const [results, setResults] = useState<SurveyResults | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found'>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const data = await getSurveyResults(id)
      setResults(data)
      setStatus(data ? 'ready' : 'not-found')
      setUpdatedAt(new Date())
    } catch (e) {
      setError(friendlyError(e))
      setStatus((s) => (s === 'loading' ? 'ready' : s))
    } finally {
      setRefreshing(false)
    }
  }, [id])

  useEffect(() => {
    // Initial fetch; state updates happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        {status === 'loading' && (
          <p role="status" className="text-slate-600">
            Loading results...
          </p>
        )}

        {status === 'not-found' && (
          <>
            <p className="text-lg text-slate-700">Survey not found.</p>
            <Link to="/dashboard" className={`${buttonSecondary} mt-4`}>
              Back to Dashboard
            </Link>
          </>
        )}

        {error && (
          <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-red-800">
            {error}
          </p>
        )}

        {status === 'ready' && results && (
          <>
            <header>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold break-words sm:text-3xl">{results.title}</h1>
                <StatusBadge status={results.status} />
              </div>
              <p className="mt-2 text-xl text-slate-800">
                <span className="font-semibold">{results.response_count}</span>{' '}
                {results.response_count === 1 ? 'response' : 'responses'}
              </p>
              <p className="mt-1 text-sm text-slate-600" aria-live="polite">
                {results.last_response_at &&
                  `Last response ${dateTimeFormat.format(new Date(results.last_response_at))}. `}
                {updatedAt && `Updated ${timeFormat.format(updatedAt)}.`}
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={load}
                  disabled={refreshing}
                  className={buttonPrimary}
                >
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
                {results.status === 'active' && (
                  <Link to={`/surveys/${results.survey_id}/present`} className={buttonSecondary}>
                    Present QR
                  </Link>
                )}
                <Link to="/dashboard" className={buttonSecondary}>
                  Back to Dashboard
                </Link>
              </div>
            </header>

            {results.response_count === 0 && (
              <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <p className="text-lg font-medium text-slate-800">No responses yet.</p>
                {results.status === 'active' && (
                  <p className="mt-1 text-slate-600">Display the QR code so students can join.</p>
                )}
              </div>
            )}

            {/* Hold the previous render, dimmed, while refreshing: no layout jump. */}
            <ol
              className={`mt-8 space-y-6 transition-opacity ${refreshing ? 'opacity-60' : ''}`}
              aria-busy={refreshing}
            >
              {results.questions.map((q, i) => (
                <QuestionCard
                  key={q.question_id}
                  question={q}
                  number={i + 1}
                  totalResponses={results.response_count}
                />
              ))}
            </ol>
          </>
        )}
      </main>
    </div>
  )
}

function QuestionCard({
  question,
  number,
  totalResponses,
}: {
  question: QuestionResult
  number: number
  totalResponses: number
}) {
  const answered = question.response_count
  const skipped = totalResponses - answered
  const heading = `${number}. ${question.question_text}`

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold break-words">{heading}</h2>

      {answered === 0 ? (
        <>
          <p className="mt-2 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-900">
            Unanswered — no answers to this question yet
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-700">
            {question.choices.map((c) => (
              <li key={c.choice_id}>{c.choice_text}</li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">
            {plural(answered, 'answer', 'answers')}
            {skipped > 0 && ` · ${plural(skipped, 'response', 'responses')} skipped this question`}
          </p>
          <div className="mt-3">
            <ChoiceBarChart choices={question.choices} label={heading} />
          </div>
          <details className="mt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-blue-700 underline">
              Show as table
            </summary>
            <table className="mt-2 w-full text-left text-sm">
              <caption className="sr-only">{heading}</caption>
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Choice
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Count
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Percent
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {question.choices.map((c) => (
                  <tr key={c.choice_id} className="border-b border-slate-100">
                    <th scope="row" className="py-2 pr-4 font-normal break-words">
                      {c.choice_text}
                    </th>
                    <td className="py-2 pr-4 text-right">{c.count}</td>
                    <td className="py-2 text-right">{formatPercent(c.percentage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </li>
  )
}
