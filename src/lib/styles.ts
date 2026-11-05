const focus =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-700'

export const buttonPrimary = `inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-5 text-base font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 ${focus}`

export const buttonSecondary = `inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-base font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 ${focus}`

export const input = `block min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-blue-700 focus:outline-2 focus:outline-blue-700`

export const buttonDanger = `inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-5 text-base font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60 ${focus}`

/** Smaller secondary button for dense action rows (still a 44px touch target). */
export const actionButton = `inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 ${focus}`

export const actionButtonDanger = `inline-flex min-h-11 items-center justify-center rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 ${focus}`
