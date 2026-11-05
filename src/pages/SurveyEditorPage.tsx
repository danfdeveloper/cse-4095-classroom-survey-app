import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import AppHeader from '../components/AppHeader.tsx'
import ConfirmDialog from '../components/ConfirmDialog.tsx'
import FieldError from '../components/FieldError.tsx'
import QuestionEditor from '../components/QuestionEditor.tsx'
import StatusBadge from '../components/StatusBadge.tsx'
import {
  emptyQuestion,
  emptySurvey,
  fromSurvey,
  ids,
  move,
  snapshot,
  toPayload,
  validate,
  type QuestionDraft,
  type SurveyDraft,
} from '../lib/editorModel.ts'
import { focusSoon } from '../lib/focus.ts'
import { buttonPrimary, buttonSecondary, input } from '../lib/styles.ts'
import {
  activateSurvey,
  duplicateSurvey,
  friendlyError,
  getActiveSurvey,
  getSurvey,
  saveSurvey,
  type Survey,
  type SurveyStatus,
} from '../lib/surveys.ts'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not-found' }
  | { kind: 'locked'; survey: Survey }
  | { kind: 'ready' }

type Confirm =
  { kind: 'delete-question'; index: number } | { kind: 'activate'; activeTitle: string } | null

export default function SurveyEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [surveyId, setSurveyId] = useState<string | null>(id ?? null)
  const [draft, setDraft] = useState<SurveyDraft>(emptySurvey)
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshot(emptySurvey()))
  const [load, setLoad] = useState<LoadState>(id ? { kind: 'loading' } : { kind: 'ready' })
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState<'saving' | 'activating' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  // Id whose data is already in `draft` (set after the first save of a new survey,
  // so the URL change to /surveys/:id/edit does not trigger a reload).
  const loadedId = useRef<string | null>(null)

  // Load an existing survey.
  useEffect(() => {
    if (!id || id === loadedId.current) return
    let active = true
    getSurvey(id)
      .then((survey) => {
        if (!active) return
        if (!survey) return setLoad({ kind: 'not-found' })
        if (survey.status !== 'draft') return setLoad({ kind: 'locked', survey })
        const loaded = fromSurvey(survey)
        loadedId.current = id
        setSurveyId(id)
        setDraft(loaded)
        setSavedSnapshot(snapshot(loaded))
        setLoad({ kind: 'ready' })
      })
      .catch((error) => active && setLoad({ kind: 'error', message: friendlyError(error) }))
    return () => {
      active = false
    }
  }, [id])

  const errors = showErrors ? validate(draft) : {}
  const dirty = snapshot(draft) !== savedSnapshot

  // Warn before closing the tab or reloading with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function update(next: Partial<SurveyDraft>) {
    setDraft((d) => ({ ...d, ...next }))
    setJustSaved(false)
  }

  function updateQuestion(index: number, question: QuestionDraft) {
    update({ questions: draft.questions.map((q, i) => (i === index ? question : q)) })
  }

  function addQuestion() {
    const q = emptyQuestion()
    update({ questions: [...draft.questions, q] })
    focusSoon(ids.questionText(q))
  }

  function moveQuestion(index: number, delta: -1 | 1) {
    const q = draft.questions[index]
    update({ questions: move(draft.questions, index, delta) })
    const target = index + delta
    const sameDisabled = delta === -1 ? target === 0 : target === draft.questions.length - 1
    const direction = (delta === -1) !== sameDisabled ? 'up' : 'down'
    focusSoon(`q-${q.key}-${direction}`)
  }

  function requestDeleteQuestion(index: number) {
    const q = draft.questions[index]
    const hasContent =
      q.text.trim() || (q.type === 'multiple_choice' && q.choices.some((c) => c.text.trim()))
    if (hasContent) setConfirm({ kind: 'delete-question', index })
    else deleteQuestion(index)
  }

  function deleteQuestion(index: number) {
    const remaining = draft.questions.filter((_, i) => i !== index)
    update({ questions: remaining })
    setConfirm(null)
    const neighbor = remaining[Math.max(0, index - 1)]
    focusSoon(neighbor ? ids.questionText(neighbor) : 'add-question')
  }

  /** Validates and saves. Returns the survey id on success, or null. */
  async function save(): Promise<string | null> {
    setSaveError(null)
    setShowErrors(true)
    const found = validate(draft)
    const firstInvalid = Object.keys(found)[0]
    if (firstInvalid) {
      focusSoon(firstInvalid)
      return null
    }

    try {
      const savedId = await saveSurvey(surveyId, toPayload(draft))
      setSavedSnapshot(snapshot(draft))
      setShowErrors(false)
      if (!surveyId) {
        loadedId.current = savedId
        setSurveyId(savedId)
        navigate(`/surveys/${savedId}/edit`, { replace: true })
      }
      return savedId
    } catch (error) {
      setSaveError(friendlyError(error))
      return null
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setBusy('saving')
    const savedId = await save()
    setBusy(null)
    setJustSaved(savedId !== null)
  }

  async function handleActivate() {
    const firstInvalid = Object.keys(validate(draft))[0]
    if (firstInvalid) {
      setShowErrors(true)
      focusSoon(firstInvalid)
      return
    }
    setBusy('activating')
    try {
      const active = await getActiveSurvey()
      if (active && active.id !== surveyId) {
        setBusy(null)
        setConfirm({ kind: 'activate', activeTitle: active.title })
        return
      }
    } catch (error) {
      setSaveError(friendlyError(error))
      setBusy(null)
      return
    }
    await saveAndActivate()
  }

  async function saveAndActivate() {
    setBusy('activating')
    const savedId = await save()
    if (!savedId) {
      setBusy(null)
      setConfirm(null)
      return
    }
    try {
      await activateSurvey(savedId)
      navigate(`/surveys/${savedId}/present`)
    } catch (error) {
      setSaveError(friendlyError(error))
      setBusy(null)
      setConfirm(null)
    }
  }

  const heading = surveyId ? 'Edit Survey' : 'New Survey'

  if (load.kind !== 'ready') {
    return (
      <EditorShell title={heading}>
        <LoadMessage state={load} />
      </EditorShell>
    )
  }

  const titleError = errors[ids.title]
  const working = busy !== null

  return (
    <EditorShell title={heading}>
      <form onSubmit={handleSave} noValidate className="mt-6 space-y-6">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <label htmlFor={ids.title} className="mb-1 block font-medium">
              Survey Title
            </label>
            <input
              id={ids.title}
              type="text"
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              className={input}
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? `${ids.title}-error` : undefined}
            />
            <FieldError id={ids.title} message={titleError} />
          </div>
          <div>
            <label htmlFor={ids.description} className="mb-1 block font-medium">
              Description <span className="font-normal text-slate-600">(optional)</span>
            </label>
            <textarea
              id={ids.description}
              rows={2}
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
              className={`${input} py-2`}
            />
          </div>
        </div>

        <section aria-labelledby={ids.questions}>
          <h2 id={ids.questions} tabIndex={-1} className="text-xl font-bold">
            Questions
          </h2>
          <FieldError id={ids.questions} message={errors[ids.questions]} />
          <ol className="mt-3 space-y-4">
            {draft.questions.map((q, i) => (
              <QuestionEditor
                key={q.key}
                question={q}
                index={i}
                total={draft.questions.length}
                errors={errors}
                disabled={working}
                onChange={(next) => updateQuestion(i, next)}
                onMove={(delta) => moveQuestion(i, delta)}
                onDelete={() => requestDeleteQuestion(i)}
              />
            ))}
          </ol>
          <button
            id="add-question"
            type="button"
            onClick={addQuestion}
            disabled={working}
            className={`${buttonSecondary} mt-4 w-full sm:w-auto`}
          >
            + Add Question
          </button>
        </section>

        {showErrors && Object.keys(errors).length > 0 && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-red-800">
            Fix the highlighted fields before saving.
          </p>
        )}
        {saveError && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-red-800">
            {saveError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
          <button type="submit" disabled={working} className={buttonSecondary}>
            {busy === 'saving' ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            type="button"
            onClick={handleActivate}
            disabled={working}
            className={buttonPrimary}
          >
            {busy === 'activating' ? 'Activating...' : 'Activate'}
          </button>
          <p role="status" className="text-sm text-slate-600">
            {justSaved && !dirty ? 'Saved' : dirty && surveyId ? 'Unsaved changes' : ''}
          </p>
        </div>
      </form>

      <ConfirmDialog
        open={confirm?.kind === 'delete-question'}
        title={confirm?.kind === 'delete-question' ? `Delete Question ${confirm.index + 1}?` : ''}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === 'delete-question' && deleteQuestion(confirm.index)}
      >
        <p>The question and its choices will be removed from this survey.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === 'activate'}
        busy={busy === 'activating'}
        title="Activate this survey?"
        confirmLabel="Activate"
        onCancel={() => setConfirm(null)}
        onConfirm={saveAndActivate}
      >
        {confirm?.kind === 'activate' && (
          <p>"{confirm.activeTitle}" is currently active. Activating this survey will close it.</p>
        )}
      </ConfirmDialog>
    </EditorShell>
  )
}

function LoadMessage({ state }: { state: Exclude<LoadState, { kind: 'ready' }> }) {
  if (state.kind === 'loading') {
    return (
      <p role="status" className="mt-6 text-slate-600">
        Loading survey...
      </p>
    )
  }
  if (state.kind === 'not-found') {
    return <p className="mt-6 text-lg text-slate-700">Survey not found.</p>
  }
  if (state.kind === 'error') {
    return (
      <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-red-800">
        {state.message}
      </p>
    )
  }
  return <LockedNotice survey={state.survey} />
}

function LockedNotice({ survey }: { survey: Survey }) {
  const navigate = useNavigate()
  const [dupBusy, setDupBusy] = useState(false)
  const [dupError, setDupError] = useState<string | null>(null)
  async function duplicate() {
    setDupBusy(true)
    try {
      navigate(`/surveys/${await duplicateSurvey(survey.id)}/edit`)
    } catch (error) {
      setDupError(friendlyError(error))
      setDupBusy(false)
    }
  }
  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{survey.title}</h2>
        <StatusBadge status={survey.status} />
      </div>
      <p className="mt-3 text-slate-700">{lockedReason(survey.status)}</p>
      {dupError && (
        <p role="alert" className="mt-3 text-red-800">
          {dupError}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={duplicate} disabled={dupBusy} className={buttonPrimary}>
          {dupBusy ? 'Duplicating...' : 'Duplicate to Edit'}
        </button>
        <Link to="/dashboard" className={buttonSecondary}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}

function lockedReason(status: SurveyStatus) {
  if (status === 'active') {
    return 'This survey is active and cannot be edited. Close it from the dashboard, or duplicate it to make a new draft.'
  }
  return `This survey is ${status} and cannot be edited. Only draft surveys can be edited — duplicate it to make changes.`
}

function EditorShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{title}</h1>
          <Link to="/dashboard" className="font-medium text-blue-700 underline">
            Back to Dashboard
          </Link>
        </div>
        {children}
      </main>
    </div>
  )
}
