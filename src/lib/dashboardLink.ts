/** Remembers the dashboard's filter query so "Back to Dashboard" links restore it. */
const KEY = 'classroom-survey:dashboard-search'

export function rememberDashboardSearch(search: string) {
  try {
    sessionStorage.setItem(KEY, search)
  } catch {
    // Storage unavailable: links fall back to the unfiltered dashboard.
  }
}

export function dashboardPath(): string {
  try {
    const search = sessionStorage.getItem(KEY)
    return search ? `/dashboard?${search}` : '/dashboard'
  } catch {
    return '/dashboard'
  }
}
