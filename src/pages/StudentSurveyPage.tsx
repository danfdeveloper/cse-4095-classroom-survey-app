import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { getAnonymousToken, hasSubmitted, markSubmitted } from '../lib/anonymousToken.ts'
import { focusSoon } from '../lib/focus.ts'
import { buttonPrimary } from '../lib/styles.ts'
import {
  getPublicSurvey,
  submitResponse,
  type PublicQuestion,
  type PublicSurveyResult,
} from '../lib/studentSurvey.ts'

type ActiveSurvey = Extract<PublicSurveyResult, { status: 'active' }>

type View =
  | { kind: 'loading' }
  | { kind: 'load-error' }
  | { kind: 'not-found' }
  | { kind: 'closed' }
  | { kind: 'already-submitted' }
  | { kind: 'success' }
  | { kind: 'form'; data: ActiveSurvey }

export default function StudentSurveyPage() {
  const { slug = '' } = useParams()
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    getPublicSurvey(slug)
      .then((result) => {
        if (!active) return
        if (result.status === 'not_found') setView({ kind: 'not-found' })
        else if (result.status === 'closed') setView({ kind: 'closed' })
        else if (hasSubmitted(result.survey.id)) setView({ kind: 'already-submitted' })
        else {
          document.title = result.survey.title
          setView({ kind: 'form', data: result })
        }
      })
      .catch(() => active && setView({ kind: 'load-error' }))
    return () => {
      active = false
    }
  }, [slug, attempt])

  switch (view.kind) {
    case 'loading':
      return (
        <Message>
          <p role="status" className="text-lg text-slate-600">
            Loading survey...
          </p>
        </Message>
      )
    case 'load-error':
      return (
        <Message title="Could not load the survey.">
          <p>Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => {
              setView({ kind: 'loading' })
              setAttempt((n) => n + 1)
            }}
            className={`${buttonPrimary} mt-6 w-full`}
          >
            Try Again
          </button>
        </Message>
      )
    case 'not-found':
      return <Message title="Survey not found." />
    case 'closed':
      return <Message title="This survey is no longer accepting responses." />
    case 'already-submitted':
      return <Message title="You have already submitted a response to this survey." />
    case 'success':
      return (
        <Message title="Thank you!">
          <p>Your response has been recorded.</p>
        </Message>
      )
    case 'form':
      return <SurveyForm data={view.data} onDone={setView} />
  }
}

function SurveyForm({ data, onDone }: { data: ActiveSurvey; onDone: (view: View) => void }) {
  const { survey, questions } = data
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [showErrors, setShowErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const missing = questions.filter((q) => !selected[q.id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (missing.length > 0) {
      setShowErrors(true)
      focusSoon(`question-${missing[0].id}`)
      return
    }

    setSubmitting(true)
    const outcome = await submitResponse(
      survey.id,
      getAnonymousToken(),
      questions.map((q) => ({ question_id: q.id, choice_id: selected[q.id] })),
    )
    setSubmitting(false)

    if (outcome.kind === 'success' || outcome.kind === 'duplicate') markSubmitted(survey.id)
    if (outcome.kind === 'success') onDone({ kind: 'success' })
    else if (outcome.kind === 'duplicate') onDone({ kind: 'already-submitted' })
    else if (outcome.kind === 'closed') onDone({ kind: 'closed' })
    else setError(outcome.message)
  }

  return (
    <main className="mx-auto max-w-xl px-4 pt-8 pb-12">
      <h1 className="text-2xl leading-tight font-bold break-words sm:text-3xl">{survey.title}</h1>
      {survey.description && (
        <p className="mt-2 text-lg whitespace-pre-line text-slate-700">{survey.description}</p>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-8">
        {questions.map((q, i) => (
          <QuestionField
            key={q.id}
            question={q}
            number={i + 1}
            value={selected[q.id]}
            error={showErrors && !selected[q.id] ? 'Please choose an answer.' : undefined}
            disabled={submitting}
            onSelect={(choiceId) => setSelected((s) => ({ ...s, [q.id]: choiceId }))}
          />
        ))}

        {showErrors && missing.length > 0 && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-red-800">
            Please answer every question before submitting.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-red-800">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full text-lg`}>
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </form>
    </main>
  )
}

function QuestionField({
  question,
  number,
  value,
  error,
  disabled,
  onSelect,
}: {
  question: PublicQuestion
  number: number
  value: string | undefined
  error?: string
  disabled: boolean
  onSelect: (choiceId: string) => void
}) {
  const groupId = `question-${question.id}`
  return (
    <fieldset
      id={groupId}
      tabIndex={-1}
      disabled={disabled}
      aria-describedby={error ? `${groupId}-error` : undefined}
      className="rounded-lg outline-none focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
    >
      <legend className="text-lg font-semibold break-words">
        {number}. {question.question_text}
      </legend>
      {error && (
        <p id={`${groupId}-error`} className="mt-1 font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="mt-3 space-y-3">
        {question.choices.map((c) => {
          const checked = value === c.id
          return (
            <label
              key={c.id}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-lg has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-700 ${
                checked
                  ? 'border-blue-700 bg-blue-50 font-semibold'
                  : error
                    ? 'border-red-300 bg-white'
                    : 'border-slate-300 bg-white hover:border-slate-400'
              }`}
            >
              <input
                type="radio"
                name={groupId}
                value={c.id}
                checked={checked}
                onChange={() => onSelect(c.id)}
                className="size-5 shrink-0 accent-blue-700"
              />
              <span className="break-words">{c.choice_text}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function Message({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center px-4 py-12 text-center">
      {title && (
        <h1 role="status" className="text-2xl leading-tight font-bold">
          {title}
        </h1>
      )}
      {children && <div className="mt-3 text-lg text-slate-700">{children}</div>}
    </main>
  )
}
