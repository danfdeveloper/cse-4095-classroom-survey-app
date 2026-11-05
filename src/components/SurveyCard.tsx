import { Link } from 'react-router'
import { actionButton, actionButtonDanger } from '../lib/styles.ts'
import type { SurveyListItem } from '../lib/surveys.ts'
import StatusBadge from './StatusBadge.tsx'

export type SurveyAction = 'activate' | 'close' | 'duplicate' | 'archive' | 'delete'

interface Props {
  survey: SurveyListItem
  busy: boolean
  onAction: (action: SurveyAction, survey: SurveyListItem) => void
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export default function SurveyCard({ survey, busy, onAction }: Props) {
  const { id, status } = survey
  const button = (action: SurveyAction, label: string, danger = false) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => onAction(action, survey)}
      className={danger ? actionButtonDanger : actionButton}
    >
      {label}
    </button>
  )
  const link = (to: string, label: string) => (
    <Link to={to} className={actionButton}>
      {label}
    </Link>
  )

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold break-words">{survey.title}</h2>
        <StatusBadge status={status} />
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Created {dateFormat.format(new Date(survey.created_at))}
        {' · '}
        {survey.response_count} {survey.response_count === 1 ? 'response' : 'responses'}
      </p>

      <div className="mt-4 flex flex-wrap gap-2" aria-label={`Actions for ${survey.title}`}>
        {status === 'draft' && (
          <>
            {link(`/surveys/${id}/edit`, 'Edit')}
            {button('activate', 'Activate')}
            {button('duplicate', 'Duplicate')}
            {button('archive', 'Archive')}
            {button('delete', 'Delete', true)}
          </>
        )}
        {status === 'active' && (
          <>
            {link(`/surveys/${id}/present`, 'Present')}
            {link(`/surveys/${id}/results`, 'Results')}
            {button('close', 'Close')}
            {button('duplicate', 'Duplicate')}
          </>
        )}
        {status === 'closed' && (
          <>
            {link(`/surveys/${id}/results`, 'Results')}
            {button('duplicate', 'Duplicate')}
            {button('archive', 'Archive')}
            {button('delete', 'Delete', true)}
          </>
        )}
        {status === 'archived' && (
          <>
            {link(`/surveys/${id}/results`, 'Results')}
            {button('duplicate', 'Duplicate')}
            {button('delete', 'Delete', true)}
          </>
        )}
      </div>
    </li>
  )
}
