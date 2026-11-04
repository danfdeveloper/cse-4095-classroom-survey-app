import type { ReactNode } from 'react'

export default function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {children}
      </div>
    </main>
  )
}
