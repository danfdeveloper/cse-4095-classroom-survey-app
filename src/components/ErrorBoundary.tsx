import { Component, type ErrorInfo, type ReactNode } from 'react'
import { buttonPrimary } from '../lib/styles.ts'

interface State {
  error: Error | null
}

/**
 * Last-resort catch for render errors and failed lazy-page loads (for example a
 * stale tab after a new deployment renamed the JS chunks). Shows a friendly
 * message with a Reload button instead of a blank page.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const isChunkError =
      /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
        this.state.error.message,
      )
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 text-center">
        <h1 className="text-2xl font-bold">
          {isChunkError ? 'This page needs to be reloaded.' : 'Something went wrong.'}
        </h1>
        <p className="mt-3 text-lg text-slate-700">
          {isChunkError
            ? 'A newer version of the app is available.'
            : 'Please reload the page. If the problem continues, try again later.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${buttonPrimary} mt-6`}
        >
          Reload
        </button>
      </main>
    )
  }
}
