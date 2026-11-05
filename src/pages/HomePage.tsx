import { Link } from 'react-router'
import { buttonPrimary } from '../lib/styles.ts'
import PageShell from '../components/PageShell.tsx'

export default function HomePage() {
  return (
    <PageShell>
      <h1 className="text-3xl font-bold tracking-tight">Classroom Survey</h1>
      <p className="mt-3 text-lg text-slate-600">Quick in-class understanding checks</p>
      <Link to="/login" className={`${buttonPrimary} mt-8 px-6`}>
        Instructor Login
      </Link>
    </PageShell>
  )
}
