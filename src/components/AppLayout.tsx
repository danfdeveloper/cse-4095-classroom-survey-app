import type { ReactNode } from 'react'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'
import AppHeader from './AppHeader.tsx'

const WIDTHS = {
  wide: 'max-w-5xl', // lists
  medium: 'max-w-4xl', // results
  narrow: 'max-w-3xl', // forms
} as const

/**
 * Shared frame for signed-in instructor pages: skip link, header, and a
 * focusable <main> with consistent padding.
 */
export default function AppLayout({
  title,
  width = 'wide',
  children,
}: {
  title?: string
  width?: keyof typeof WIDTHS
  children: ReactNode
}) {
  useDocumentTitle(title)
  return (
    <div className="min-h-svh">
      <a
        href="#main"
        className="sr-only rounded-lg bg-white px-4 py-3 font-semibold text-blue-800 shadow-lg focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:outline-3 focus:outline-blue-700"
      >
        Skip to main content
      </a>
      <AppHeader />
      <main id="main" tabIndex={-1} className={`mx-auto ${WIDTHS[width]} px-4 py-8 outline-none`}>
        {children}
      </main>
    </div>
  )
}
