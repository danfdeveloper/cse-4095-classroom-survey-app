import { Link } from 'react-router'
import PageShell from '../components/PageShell.tsx'

export default function NotFoundPage() {
  return (
    <PageShell>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/" className="mt-6 inline-block font-medium text-blue-700 underline">
        Go to home page
      </Link>
    </PageShell>
  )
}
