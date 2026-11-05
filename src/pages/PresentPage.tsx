import QRCode from 'qrcode'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import ConfirmDialog from '../components/ConfirmDialog.tsx'
import { displayUrl, publicSurveyUrl } from '../lib/publicUrl.ts'
import { buildQrPng } from '../lib/qrImage.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'
import { buttonDanger, buttonPrimary, buttonSecondary } from '../lib/styles.ts'
import {
  closeSurvey,
  countResponses,
  friendlyError,
  getSurvey,
  getSurveyStatus,
  STATUS_LABELS,
  type Survey,
} from '../lib/surveys.ts'
import { dashboardPath } from '../lib/dashboardLink.ts'

/** How often the response count refreshes while the survey is active. */
const POLL_MS = 5000

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not-found' }
  | { kind: 'ready'; survey: Survey; url: string; qrSvg: string }

export default function PresentPage() {
  const { id = '' } = useParams()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [count, setCount] = useState<number | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [closing, setClosing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  useDocumentTitle(state.kind === 'ready' ? `Present: ${state.survey.title}` : 'Present')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const survey = await getSurvey(id)
        if (!active) return
        if (!survey) return setState({ kind: 'not-found' })
        const url = survey.public_slug ? publicSurveyUrl(survey.public_slug) : ''
        const qrSvg = url ? await QRCode.toString(url, { type: 'svg', margin: 2 }) : ''
        if (!active) return
        setState({ kind: 'ready', survey, url, qrSvg })
        setCount(await countResponses(id))
      } catch (error) {
        if (active) setState({ kind: 'error', message: friendlyError(error) })
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  const isActive = state.kind === 'ready' && state.survey.status === 'active'

  const refreshCount = useCallback(async () => {
    try {
      setCount(await countResponses(id))
    } catch {
      // Keep showing the last known count; the next poll will retry.
    }
  }, [id])

  // While presenting, refresh the count and notice if the survey was closed elsewhere
  // (e.g. from the dashboard), so the projector never shows a dead QR code.
  const poll = useCallback(async () => {
    await refreshCount()
    try {
      const status = await getSurveyStatus(id)
      if (status && status !== 'active') {
        setState((s) => (s.kind === 'ready' ? { ...s, survey: { ...s.survey, status } } : s))
      }
    } catch {
      // Ignore; retried on the next poll.
    }
  }, [id, refreshCount])

  useEffect(() => {
    if (!isActive) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') poll()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [isActive, poll])

  async function handleClose() {
    if (state.kind !== 'ready') return
    setClosing(true)
    setActionError(null)
    try {
      const survey = await closeSurvey(state.survey.id)
      setState({ ...state, survey })
      await refreshCount()
    } catch (error) {
      setActionError(friendlyError(error))
    } finally {
      setClosing(false)
      setConfirmClose(false)
    }
  }

  async function downloadQr() {
    if (state.kind !== 'ready') return
    try {
      const a = document.createElement('a')
      a.href = await buildQrPng(state.url, state.survey.title)
      a.download = `survey-${state.survey.public_slug}-qr.png`
      a.click()
    } catch {
      setActionError('Could not create the QR code image. Please try again.')
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.()
  }

  if (state.kind !== 'ready') {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
        {state.kind === 'loading' && (
          <p role="status" className="text-xl text-slate-600">
            Loading survey...
          </p>
        )}
        {state.kind === 'not-found' && <p className="text-2xl">Survey not found.</p>}
        {state.kind === 'error' && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-red-800">
            {state.message}
          </p>
        )}
        <Link to={dashboardPath()} className={buttonSecondary}>
          Back to Dashboard
        </Link>
      </main>
    )
  }

  const { survey, url, qrSvg } = state
  const countLabel = count === null ? '…' : count

  return (
    // On larger screens the page is exactly one viewport tall and the QR code takes
    // whatever height is left, so long titles never push the controls off a projector.
    <main className="flex min-h-svh flex-col items-center bg-white px-4 py-6 text-center sm:h-svh">
      <h1
        title={survey.title}
        className="line-clamp-2 max-w-6xl shrink-0 text-3xl leading-tight font-bold tracking-tight break-words sm:text-5xl"
      >
        {survey.title}
      </h1>

      {isActive ? (
        <>
          <div
            role="img"
            aria-label={`QR code linking to ${url}`}
            className="mt-4 aspect-square w-[min(90vw,60svh)] sm:aspect-auto sm:min-h-64 sm:w-full sm:flex-1 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-3 shrink-0 font-mono text-2xl font-semibold break-all text-slate-900 sm:text-4xl">
            {displayUrl(url)}
          </p>
          <p className="mt-2 shrink-0 text-2xl text-slate-700 sm:text-3xl" aria-live="polite">
            Responses: <span className="font-bold text-slate-900">{countLabel}</span>
          </p>
        </>
      ) : (
        <div className="mt-10 max-w-xl space-y-3">
          <p className="text-2xl text-slate-800">
            {survey.status === 'closed'
              ? 'This survey is closed.'
              : `This survey is ${STATUS_LABELS[survey.status].toLowerCase()}, not active.`}
          </p>
          <p className="text-xl text-slate-700">
            Responses: <span className="font-bold text-slate-900">{countLabel}</span>
          </p>
          {survey.status === 'draft' && (
            <p className="text-slate-600">Activate it from the dashboard to show a QR code.</p>
          )}
        </div>
      )}

      {actionError && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-red-800">
          {actionError}
        </p>
      )}

      <div className="mt-6 flex shrink-0 flex-wrap justify-center gap-3">
        <Link to={`/surveys/${survey.id}/results`} className={buttonPrimary}>
          View Results
        </Link>
        {isActive && (
          <>
            <button type="button" onClick={downloadQr} className={buttonSecondary}>
              Download QR Code
            </button>
            <button type="button" onClick={toggleFullscreen} className={buttonSecondary}>
              Full Screen
            </button>
            <button type="button" onClick={() => setConfirmClose(true)} className={buttonDanger}>
              Close Survey
            </button>
          </>
        )}
        <Link to={dashboardPath()} className={buttonSecondary}>
          Dashboard
        </Link>
      </div>

      <ConfirmDialog
        open={confirmClose}
        busy={closing}
        title={`Close "${survey.title}"?`}
        confirmLabel="Close Survey"
        danger
        onCancel={() => setConfirmClose(false)}
        onConfirm={handleClose}
      >
        <p>Students will no longer be able to submit responses.</p>
      </ConfirmDialog>
    </main>
  )
}
