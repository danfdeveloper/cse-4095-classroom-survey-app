import { STATUS_LABELS, type SurveyStatus } from '../lib/surveys.ts'

const STYLES: Record<SurveyStatus, string> = {
  draft: 'bg-slate-100 text-slate-800 ring-slate-300',
  active: 'bg-green-100 text-green-900 ring-green-600',
  closed: 'bg-amber-100 text-amber-900 ring-amber-500',
  archived: 'bg-zinc-200 text-zinc-800 ring-zinc-400',
}

/** Status shown as text, so it never relies on color alone. */
export default function StatusBadge({ status }: { status: SurveyStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ring-inset ${STYLES[status]}`}
    >
      {status === 'active' && (
        <span aria-hidden="true" className="size-2 rounded-full bg-green-600" />
      )}
      {STATUS_LABELS[status]}
    </span>
  )
}
