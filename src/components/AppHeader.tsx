import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { buttonSecondary } from '../lib/styles.ts'
import { dashboardPath } from '../lib/dashboardLink.ts'

/** Header for signed-in instructor pages. */
export default function AppHeader() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleLogout() {
    setSigningOut(true)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to={dashboardPath()} className="text-lg font-bold tracking-tight text-slate-900">
          Classroom Survey
        </Link>
        <div className="flex items-center gap-3">
          {user?.email && (
            <span className="text-sm text-slate-600">
              Signed in as <span className="font-medium text-slate-900">{user.email}</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            className={buttonSecondary}
          >
            {signingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </div>
    </header>
  )
}
