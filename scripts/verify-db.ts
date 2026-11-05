/**
 * Phase 2 verification: checks RLS and the submission RPC against the live Supabase project.
 *
 * Usage: npm run verify:db
 * Needs in .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD
 *
 * Creates a temporary survey, exercises it as anon and as the instructor, then deletes it.
 * Refuses to run if another survey is already Active, so real data is never touched.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
const email = process.env.INSTRUCTOR_EMAIL
const password = process.env.INSTRUCTOR_PASSWORD

if (!url || !key || !email || !password) {
  console.error(
    'Missing env. Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, INSTRUCTOR_EMAIL and INSTRUCTOR_PASSWORD in .env.local.',
  )
  process.exit(1)
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const anon = createClient(url, key, opts)
const instructor = createClient(url, key, opts)

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

function must<T>(
  res: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  if (res.data == null) throw new Error(`${what}: no data returned`)
  return res.data
}

async function submit(client: SupabaseClient, surveyId: string, token: string, answers: object[]) {
  return client.rpc('submit_survey_response', {
    p_survey_id: surveyId,
    p_anonymous_token: token,
    p_answers: answers,
  })
}

let surveyId: string | undefined

async function main() {
  // --- Instructor login --------------------------------------------------
  const login = await instructor.auth.signInWithPassword({ email: email!, password: password! })
  check('instructor can sign in', !login.error, login.error?.message)
  if (login.error) return

  const active = must(
    await instructor.from('surveys').select('id,title').eq('status', 'active'),
    'check active',
  )
  if (active.length > 0) {
    console.error(`Aborting: survey "${active[0].title}" is already Active. Close it first.`)
    failures++
    return
  }

  // --- Instructor full access: create survey, questions, choices ----------
  const survey = must(
    await instructor
      .from('surveys')
      .insert({ title: '[verify-db] temporary survey' })
      .select()
      .single(),
    'create survey',
  )
  surveyId = survey.id
  check('instructor can create survey (defaults to draft)', survey.status === 'draft')

  const [mc, tf] = must(
    await instructor
      .from('questions')
      .insert([
        {
          survey_id: survey.id,
          question_text: 'MC?',
          question_type: 'multiple_choice',
          position: 1,
        },
        { survey_id: survey.id, question_text: 'TF?', question_type: 'true_false', position: 2 },
      ])
      .select()
      .order('position'),
    'create questions',
  )
  const choices = must(
    await instructor
      .from('choices')
      .insert([
        { question_id: mc.id, choice_text: 'A', position: 1 },
        { question_id: mc.id, choice_text: 'B', position: 2 },
        { question_id: tf.id, choice_text: 'True', position: 1 },
        { question_id: tf.id, choice_text: 'False', position: 2 },
      ])
      .select()
      .order('position'),
    'create choices',
  )
  const mcA = choices.find((c) => c.question_id === mc.id)!
  const tfTrue = choices.find((c) => c.question_id === tf.id)!
  check('instructor can create questions and choices', choices.length === 4)

  const bad = await instructor.from('surveys').update({ status: 'bogus' }).eq('id', survey.id)
  check('status check constraint rejects invalid status', !!bad.error)

  // --- Anon cannot see drafts --------------------------------------------
  const draftView = await anon.from('surveys').select('id').eq('id', survey.id)
  check('anon cannot read draft survey', (draftView.data ?? []).length === 0)
  const draftQ = await anon.from('questions').select('id').eq('survey_id', survey.id)
  check('anon cannot read draft questions', (draftQ.data ?? []).length === 0)
  const draftSubmit = await submit(anon, survey.id, 'tok-draft', [])
  check('anon cannot submit to draft', draftSubmit.error?.message === 'SURVEY_NOT_ACTIVE')

  // --- Activate ----------------------------------------------------------
  const slug = `verify${Math.random().toString(36).slice(2, 8)}`
  const before = survey.updated_at
  const activated = must(
    await instructor
      .from('surveys')
      .update({ status: 'active', public_slug: slug })
      .eq('id', survey.id)
      .select()
      .single(),
    'activate',
  )
  check('instructor can activate survey', activated.status === 'active')
  check('updated_at trigger bumps timestamp', activated.updated_at !== before)

  const second = await instructor
    .from('surveys')
    .insert({ title: '[verify-db] second active', status: 'active' })
    .select()
  check('only one survey can be active', !!second.error)
  if (second.data?.[0]) await instructor.from('surveys').delete().eq('id', second.data[0].id)

  // --- Anon reads active survey ------------------------------------------
  const pub = await anon.from('surveys').select('id,title').eq('public_slug', slug).single()
  check('anon can read active survey by slug', pub.data?.id === survey.id, pub.error?.message)
  const pubQ = await anon.from('questions').select('id').eq('survey_id', survey.id)
  check('anon can read active survey questions', pubQ.data?.length === 2)
  const pubC = await anon.from('choices').select('id').in('question_id', [mc.id, tf.id])
  check('anon can read active survey choices', pubC.data?.length === 4)

  // --- Anon submits via RPC ----------------------------------------------
  const good = [
    { question_id: mc.id, choice_id: mcA.id },
    { question_id: tf.id, choice_id: tfTrue.id },
  ]
  const ok = await submit(anon, survey.id, 'tok-1', good)
  check('anon can submit a response', ok.data?.success === true, ok.error?.message)

  const dup = await submit(anon, survey.id, 'tok-1', good)
  check('duplicate token rejected', dup.error?.message === 'DUPLICATE_RESPONSE', dup.error?.message)

  const missing = await submit(anon, survey.id, 'tok-2', [good[0]])
  check(
    'missing answer rejected',
    missing.error?.message === 'MISSING_REQUIRED_ANSWER',
    missing.error?.message,
  )

  const wrongChoice = await submit(anon, survey.id, 'tok-3', [
    { question_id: mc.id, choice_id: tfTrue.id },
    good[1],
  ])
  check(
    'choice from another question rejected',
    wrongChoice.error?.message === 'INVALID_CHOICE',
    wrongChoice.error?.message,
  )

  const wrongQ = await submit(anon, survey.id, 'tok-4', [
    ...good,
    { question_id: crypto.randomUUID(), choice_id: mcA.id },
  ])
  check(
    'question from another survey rejected',
    wrongQ.error?.message === 'INVALID_QUESTION',
    wrongQ.error?.message,
  )

  const garbage = await submit(anon, survey.id, 'tok-5', [{ question_id: 'nope', choice_id: 'x' }])
  check(
    'malformed payload rejected',
    garbage.error?.message === 'INVALID_PAYLOAD',
    garbage.error?.message,
  )

  // --- Anon cannot read or write results directly ------------------------
  const anonResp = await anon.from('responses').select('id').eq('survey_id', survey.id)
  check('anon cannot read responses', !!anonResp.error || (anonResp.data ?? []).length === 0)
  const anonAns = await anon.from('answers').select('id').eq('question_id', mc.id)
  check('anon cannot read answers', !!anonAns.error || (anonAns.data ?? []).length === 0)
  const anonInsert = await anon
    .from('responses')
    .insert({ survey_id: survey.id, anonymous_token: 'x' })
  check('anon cannot insert responses directly', !!anonInsert.error)
  const anonUpdate = await anon
    .from('surveys')
    .update({ title: 'hacked' })
    .eq('id', survey.id)
    .select()
  check('anon cannot modify surveys', !!anonUpdate.error || (anonUpdate.data ?? []).length === 0)
  const anonDelete = await anon.from('surveys').delete().eq('id', survey.id).select()
  check('anon cannot delete surveys', !!anonDelete.error || (anonDelete.data ?? []).length === 0)

  // --- Instructor reads results ------------------------------------------
  const resp = await instructor
    .from('responses')
    .select('id,answers(choice_id)')
    .eq('survey_id', survey.id)
  check(
    'instructor can read responses and answers',
    resp.data?.length === 1 && resp.data[0].answers.length === 2,
    resp.error?.message,
  )

  // --- Close -------------------------------------------------------------
  must(
    await instructor.from('surveys').update({ status: 'closed' }).eq('id', survey.id).select(),
    'close',
  )
  const closedView = await anon.from('surveys').select('id').eq('public_slug', slug)
  check('anon cannot read closed survey', (closedView.data ?? []).length === 0)
  const closedSubmit = await submit(anon, survey.id, 'tok-6', good)
  check('submission to closed survey rejected', closedSubmit.error?.message === 'SURVEY_NOT_ACTIVE')
}

try {
  await main()
} catch (e) {
  failures++
  console.error('ERROR', e instanceof Error ? e.message : e)
} finally {
  if (surveyId) {
    const del = await instructor.from('surveys').delete().eq('id', surveyId)
    check('instructor can delete survey (cascades)', !del.error, del.error?.message)
  }
  await instructor.auth.signOut()
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
  process.exit(failures ? 1 : 0)
}
