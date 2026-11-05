import { useEffect, useRef, type ReactNode } from 'react'
import { buttonDanger, buttonPrimary, buttonSecondary } from '../lib/styles.ts'

interface Props {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Accessible modal confirmation built on the native <dialog> element. */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onCancel()
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/50"
    >
      <h2 id="confirm-title" className="text-xl font-bold">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-slate-700">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={busy} className={buttonSecondary}>
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={danger ? buttonDanger : buttonPrimary}
        >
          {busy ? 'Working...' : confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
