import { Link } from 'react-router'
import AppHeader from '../components/AppHeader.tsx'

/** Temporary placeholder for instructor routes built in later phases. */
export default function ComingSoonPage({ title, phase }: { title: string; phase: number }) {
  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-4 text-slate-600">This page is built in Phase {phase}.</p>
        <Link to="/dashboard" className="mt-4 inline-block font-medium text-blue-700 underline">
          Back to Dashboard
        </Link>
      </main>
    </div>
  )
}
