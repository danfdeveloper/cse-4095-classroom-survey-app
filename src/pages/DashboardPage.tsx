import AppHeader from '../components/AppHeader.tsx'

export default function DashboardPage() {
  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-4 text-slate-600">Your surveys will appear here.</p>
      </main>
    </div>
  )
}
