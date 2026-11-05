import { isAuthApiError, isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase.ts'
import { AuthContext, type AuthContextValue } from './context.ts'

function friendlyAuthError(error: unknown): string {
  if (isAuthRetryableFetchError(error)) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  if (isAuthApiError(error) && (error.code === 'invalid_credentials' || error.status === 400)) {
    return 'Incorrect email or password.'
  }
  return 'Login failed. Please try again.'
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      async signIn(email, password) {
        try {
          const { error } = await supabase.auth.signInWithPassword({ email, password })
          return error ? friendlyAuthError(error) : null
        } catch (error) {
          return friendlyAuthError(error)
        }
      },
      async signOut() {
        await supabase.auth.signOut()
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
