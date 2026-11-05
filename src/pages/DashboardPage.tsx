import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import AppHeader from '../components/AppHeader.tsx'
import ConfirmDialog from '../components/ConfirmDialog.tsx'
import SurveyCard, { type SurveyAction } from '../components/SurveyCard.tsx'
import { buttonPrimary, input } from '../lib/styles.ts'
import {
  activateSurvey,
  archiveSurvey,
  closeSurvey,
  deleteSurvey,
  duplicateSurvey,
  friendlyError,
  listSurveys,
  STATUS_LABELS,
  SURVEY_STATUSES,
  type SurveyListItem,
  type SurveyStatus,
} from '../lib/surveys.ts'

type Pending = { action: SurveyAction; survey: SurveyListItem } | null

export default function DashboardPage() {
  const navigate = useNavigate()
  const [surveys, setSurveys] = useState<SurveyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<SurveyStatus | 'all'>('all')
  const [pending, setPending] = useState<Pending>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setSurveys(await listSurveys())
      setLoadError(null)
    } catch (error) {
      setLoadError(friendlyError(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial data fetch; state updates happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const activeSurvey = surveys.find((s) => s.status === 'active')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return surveys.filter(
      (s) =>
        (statusFilter === 'all' || s.status === statusFilter) &&
        (!q || s.title.toLowerCase().includes(q)),
    )
  }, [surveys, query, statusFilter])

  async function run(action: SurveyAction, survey: SurveyListItem) {
    setActionError(null)
    setBusyId(survey.id)
    try {
      if (action === 'activate') await activateSurvey(survey.id)
      if (action === 'close') await closeSurvey(survey.id)
      if (action === 'archive') await archiveSurvey(survey.id)
      if (action === 'delete') await deleteSurvey(survey.id)
      if (action === 'duplicate') {
        const newId = await duplicateSurvey(survey.id)
        navigate(`/surveys/${newId}/edit`)
        return
      }
      await load()
    } catch (error) {
      setActionError(friendlyError(error))
    } finally {
      setBusyId(null)
      setPending(null)
    }
  }

  function handleAction(action: SurveyAction, survey: SurveyListItem) {
    // Activation only needs confirming when it will close another survey.
    const needsConfirm =
      action === 'close' ||
      action === 'archive' ||
      action === 'delete' ||
      (action === 'activate' && activeSurvey && activeSurvey.id !== survey.id)
    if (needsConfirm) setPending({ action, survey })
    else run(action, survey)
  }

  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <Link to="/surveys/new" className={buttonPrimary}>
            New Survey
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_12rem]">
          <div>
            <label htmlFor="search" className="mb-1 block text-sm font-medium">
              Search
            </label>
            <input
              id="search"
              type="search"
              placeholder="Survey title"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-medium">
              Status
            </label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as SurveyStatus | 'all')}
              className={input}
            >
              <option value="all">All</option>
              {SURVEY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {actionError && (
          <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-red-800">
            {actionError}
          </p>
        )}

        <section aria-live="polite" className="mt-6">
          {loading ? (
            <p role="status" className="text-slate-600">
              Loading surveys...
            </p>
          ) : loadError ? (
            <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-red-800">
              <p>{loadError}</p>
              <button type="button" onClick={load} className="mt-2 font-medium underline">
                Try again
              </button>
            </div>
          ) : surveys.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-lg text-slate-700">You have not created any surveys yet.</p>
              <Link to="/surveys/new" className={`${buttonPrimary} mt-5`}>
                Create Your First Survey
              </Link>
            </div>
          ) : visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-lg text-slate-700">
              No surveys match your search.
            </p>
          ) : (
            <ul className="grid gap-4">
              {visible.map((survey) => (
                <SurveyCard
                  key={survey.id}
                  survey={survey}
                  busy={busyId === survey.id}
                  onAction={handleAction}
                />
              ))}
            </ul>
          )}
        </section>
      </main>

      <ConfirmDialog
        open={pending !== null}
        busy={busyId !== null}
        title={pending ? confirmTitle(pending) : ''}
        confirmLabel={pending ? confirmLabel(pending.action) : ''}
        danger={pending?.action === 'delete'}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && run(pending.action, pending.survey)}
      >
        {pending && <ConfirmBody pending={pending} activeTitle={activeSurvey?.title} />}
      </ConfirmDialog>
    </div>
  )
}

function confirmTitle({ action, survey }: NonNullable<Pending>) {
  const verb = {
    activate: 'Activate',
    close: 'Close',
    archive: 'Archive',
    delete: 'Delete',
    duplicate: 'Duplicate',
  }[action]
  return `${verb} "${survey.title}"?`
}

function confirmLabel(action: SurveyAction) {
  return {
    activate: 'Activate',
    close: 'Close Survey',
    archive: 'Archive',
    delete: 'Delete',
    duplicate: 'Duplicate',
  }[action]
}

function ConfirmBody({
  pending: { action, survey },
  activeTitle,
}: {
  pending: NonNullable<Pending>
  activeTitle?: string
}) {
  if (action === 'activate') {
    return <p>"{activeTitle}" is currently active. Activating this survey will close it.</p>
  }
  if (action === 'close') {
    return <p>Students will no longer be able to submit responses.</p>
  }
  if (action === 'archive') {
    return <p>The survey and its results are kept, but it can no longer be edited or activated.</p>
  }
  if (survey.response_count > 0) {
    return (
      <>
        <p className="rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-800">
          This survey has {survey.response_count}{' '}
          {survey.response_count === 1 ? 'response' : 'responses'}. They will be permanently
          deleted.
        </p>
        <p>Consider archiving instead to keep the results.</p>
      </>
    )
  }
  return <p>This will permanently delete the survey and all of its responses.</p>
}
