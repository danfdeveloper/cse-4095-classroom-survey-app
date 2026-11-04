import { Link } from 'react-router'
import PageShell from '../components/PageShell.tsx'

export default function HomePage() {
  return (
    <PageShell>
      <h1 className="text-3xl font-bold tracking-tight">Classroom Survey</h1>
      <p className="mt-3 text-lg text-slate-600">Quick in-class understanding checks</p>
      <Link
        to="/login"
        className="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-6 text-base font-semibold text-white hover:bg-blue-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        Instructor Login
      </Link>
    </PageShell>
  )
}
