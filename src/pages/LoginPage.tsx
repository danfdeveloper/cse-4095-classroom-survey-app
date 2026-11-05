import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import PageShell from '../components/PageShell.tsx'
import { buttonPrimary, input } from '../lib/styles.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export default function LoginPage() {
  useDocumentTitle('Instructor Login')
  const { session, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) return <Navigate to={from} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const message = await signIn(email.trim(), password)
    setSubmitting(false)
    if (message) {
      setError(message)
    } else {
      navigate(from, { replace: true })
    }
  }

  return (
    <PageShell>
      <h1 className="text-2xl font-bold">Instructor Login</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-5 text-left">
        <div>
          <label htmlFor="email" className="mb-1 block font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
          {submitting ? 'Logging in...' : 'Log In'}
        </button>
      </form>
    </PageShell>
  )
}
