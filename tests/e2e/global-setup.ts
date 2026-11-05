import { instructorClient } from './helpers.ts'

/**
 * Safety checks before any test runs. Tests activate their own temporary
 * surveys, which would close a real Active survey — so refuse to run instead.
 */
export default async function globalSetup() {
  for (const name of [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'INSTRUCTOR_EMAIL',
    'INSTRUCTOR_PASSWORD',
  ]) {
    if (!process.env[name]) throw new Error(`Missing ${name} (set it in .env.local)`)
  }
  const sb = await instructorClient()
  const { data, error } = await sb.from('surveys').select('title').eq('status', 'active')
  if (error) throw error
  if (data.length > 0) {
    throw new Error(
      `Survey "${data[0].title}" is Active. Close it before running the end-to-end tests — they would close it.`,
    )
  }
  // Remove leftovers from an interrupted earlier run.
  const { data: stale } = await sb.from('surveys').select('id').like('title', '[e2e]%')
  if (stale?.length)
    await sb
      .from('surveys')
      .delete()
      .in(
        'id',
        stale.map((s) => s.id),
      )
}
